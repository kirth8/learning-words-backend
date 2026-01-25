const express = require('express');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());

// Health check
app.get('/', (req, res) => {
    res.json({ 
        status: 'online',
        service: 'Story Generator API',
        deployedOn: 'Render.com',
        timeout: '60 seconds',
        endpoints: {
            generateStory: 'POST /api/generate-story'
        },
        note: 'Use POST /api/generate-story with {language, theme, keywords, context?, category?}'
    });
});

// Función para normalizar preguntas
function normalizeQuestions(questions, language = 'español') {
    if (!questions || !Array.isArray(questions)) {
        return [];
    }
    
    const optionLabels = language === 'inglés' || language === 'english' 
        ? ['Option A', 'Option B', 'Option C', 'Option D']
        : ['Opción A', 'Opción B', 'Opción C', 'Opción D'];
    
    return questions.map((question, index) => {
        // Determinar índice de respuesta correcta
        let correctIndex = 0;
        
        if (question.correct !== undefined) {
            // Si ya es un número (índice)
            correctIndex = parseInt(question.correct);
        } else if (question.correctAnswer !== undefined) {
            // Si es letra (A, B, C, D) o número como string
            const answer = question.correctAnswer.toString().toUpperCase();
            if (answer === 'A') correctIndex = 0;
            else if (answer === 'B') correctIndex = 1;
            else if (answer === 'C') correctIndex = 2;
            else if (answer === 'D') correctIndex = 3;
            else correctIndex = parseInt(answer) || 0;
        }
        
        // Asegurar que sea un número válido (0-3)
        correctIndex = Math.max(0, Math.min(3, correctIndex));
        
        // Normalizar opciones
        let options = question.options || [];
        if (!Array.isArray(options) || options.length === 0) {
            options = [...optionLabels];
        }
        
        // Asegurar exactamente 4 opciones
        while (options.length < 4) {
            const labelIndex = options.length;
            options.push(`${optionLabels[labelIndex]}`);
        }
        if (options.length > 4) {
            options = options.slice(0, 4);
        }
        
        return {
            id: question.id || `q${index + 1}`,
            question: question.question || `Pregunta ${index + 1}`,
            options: options,
            correct: correctIndex,
            explanation: question.explanation || 
                (language === 'inglés' || language === 'english' 
                    ? "Correct answer based on the story."
                    : "Respuesta correcta según la historia.")
        };
    });
}

// Endpoint principal
app.post('/api/generate-story', async (req, res) => {
    console.log('📨 Request received:', JSON.stringify(req.body, null, 2));
    
    try {
        const { 
            language = 'español', 
            theme = 'aventura', 
            keywords = [],
            context = '',
            category = ''
        } = req.body;
        
        // Validaciones mejoradas
        if (!language || typeof language !== 'string') {
            return res.status(400).json({ 
                success: false,
                error: 'Language is required and must be a string' 
            });
        }
        
        if (!theme || typeof theme !== 'string') {
            return res.status(400).json({ 
                success: false,
                error: 'Theme is required and must be a string' 
            });
        }
        
        // Validar que keywords sea array
        if (keywords && !Array.isArray(keywords)) {
            return res.status(400).json({
                success: false,
                error: 'Keywords must be an array'
            });
        }
        
        const apiKey = process.env.DEEPSEEK_API_KEY;
        if (!apiKey) {
            console.error('❌ API key not configured');
            return res.status(500).json({ 
                success: false,
                error: 'API key not configured on Render. Add DEEPSEEK_API_KEY environment variable.' 
            });
        }
        
        // Construir prompt inteligente (CONSISTENTE en preguntas)
        let prompt;
        if (context && context.trim().length > 0) {
            prompt = `CONTEXT PROVIDED BY USER: "${context}"
            
            Based on this context, write a story in ${language}.
            ${category ? `Category: ${category}` : ''}
            ${keywords.length > 0 ? `Include these elements: ${keywords.join(', ')}` : ''}
            
            REQUIREMENTS:
            1. Stay true to the provided context
            2. Develop characters and plot naturally
            3. Make it engaging and educational
            4. Create 10 comprehension questions with 4 options each
               - Format: {"question": "...", "options": ["A", "B", "C", "D"], "correct": 0, "explanation": "..."}
            
            Respond ONLY with valid JSON:
            {
                "title": "Creative title here",
                "story": "Full story text here...",
                "questions": [
                    {
                        "question": "Question text?",
                        "options": ["Option A text", "Option B text", "Option C text", "Option D text"],
                        "correct": 0,
                        "explanation": "Brief explanation here"
                    }
                ]
            }`;
        } else {
            prompt = `Write a story in ${language} about ${theme}.
            ${keywords.length > 0 ? `Include: ${keywords.join(', ')}.` : ''}
            ${category ? `Category: ${category}` : ''}
            
            Story should be 300-400 words.
            Include 10 comprehension questions with 4 options each.
            For "correct" field, use number 0, 1, 2, or 3 (0 = first option).
            
            Respond ONLY with JSON:
            {
                "title": "Title here",
                "story": "Story text here...",
                "questions": [
                    {
                        "question": "Question?",
                        "options": ["A text", "B text", "C text", "D text"],
                        "correct": 0,
                        "explanation": "Explanation"
                    }
                ]
            }`;
        }
        
        console.log(`🤖 Calling DeepSeek: ${language} - ${theme.substring(0, 50)}...`);
        
        const startTime = Date.now();
        
        // Llamada a DeepSeek con 55 segundos timeout
        const response = await axios.post(
            'https://api.deepseek.com/v1/chat/completions',
            {
                model: 'deepseek-chat',
                messages: [
                    { 
                        role: 'system', 
                        content: 'You are a creative writer. ALWAYS respond with VALID JSON. Use "correct" field with numbers 0-3 for correct answer index.' 
                    },
                    { 
                        role: 'user', 
                        content: prompt 
                    }
                ],
                max_tokens: 1800, // Reducido un poco para ser más rápido
                temperature: 0.7,
                response_format: { type: "json_object" }
            },
            {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                timeout: 55000  // 55 segundos (Render da 60s)
            }
        );
        
        const processingTime = Date.now() - startTime;
        const content = response.data.choices[0].message.content;
        console.log(`✅ DeepSeek responded in ${processingTime}ms`);
        
        // Parsear respuesta
        let result;
        try {
            result = JSON.parse(content);
        } catch (parseError) {
            console.warn('⚠️ JSON parse error, trying to extract...');
            // Intentar extraer JSON
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                try {
                    result = JSON.parse(jsonMatch[0]);
                } catch (secondError) {
                    console.error('❌ Could not parse JSON:', secondError.message);
                    result = {
                        title: `Story: ${theme}`,
                        story: content,
                        questions: []
                    };
                }
            } else {
                result = {
                    title: `Story: ${theme}`,
                    story: content,
                    questions: []
                };
            }
        }
        
        // Normalizar preguntas
        result.questions = normalizeQuestions(result.questions, language);
        
        // Asegurar campos mínimos
        if (!result.title) result.title = language.includes('inglés') || language.includes('english') 
            ? `Story: ${theme}` 
            : `Historia: ${theme}`;
        
        if (!result.story) result.story = content;
        
        if (!result.questions || !Array.isArray(result.questions)) {
            result.questions = [];
        }
        
        // Limitar a máximo 10 preguntas (consistente)
        if (result.questions.length > 10) {
            result.questions = result.questions.slice(0, 5);
        }
        
        // Enviar respuesta
        res.json({
            success: true,
            data: result,
            meta: {
                generatedAt: new Date().toISOString(),
                model: 'deepseek-chat',
                tokensUsed: response.data.usage?.total_tokens || 0,
                processingTime: `${processingTime}ms`,
                deployedOn: 'Render.com',
                timeoutAvailable: '60 seconds',
                questionsCount: result.questions.length
            }
        });
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        
        if (error.code === 'ECONNABORTED' || error.name === 'AbortError') {
            return res.status(504).json({
                success: false,
                error: 'DeepSeek timeout (took too long)',
                suggestion: 'Try with a simpler story or fewer keywords',
                maxDuration: '55 seconds'
            });
        }
        
        if (error.response?.status === 402) {
            return res.status(402).json({
                success: false,
                error: 'Insufficient DeepSeek balance',
                solution: 'Add credit at platform.deepseek.com',
                note: 'Current balance insufficient for API calls'
            });
        }
        
        if (error.response?.status === 429) {
            return res.status(429).json({
                success: false,
                error: 'Rate limit exceeded',
                suggestion: 'Wait a few minutes before trying again'
            });
        }
        
        if (error.response?.status === 401) {
            return res.status(401).json({
                success: false,
                error: 'Invalid API key',
                solution: 'Check DEEPSEEK_API_KEY environment variable'
            });
        }
        
        res.status(500).json({
            success: false,
            error: 'Failed to generate story',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined,
            suggestion: 'Check server logs for more information'
        });
    }
});

// Middleware para rutas no encontradas
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Endpoint not found',
        availableEndpoints: {
            'GET /': 'Health check and API information',
            'POST /api/generate-story': 'Generate story with questions'
        }
    });
});

app.listen(PORT, () => {
    console.log(`🚀 Story Generator API running on port ${PORT}`);
    console.log(`⏱️  Timeout: 60 seconds available`);
    console.log(`🔗 Health check: http://localhost:${PORT}/`);
    console.log(`📝 Endpoint: POST http://localhost:${PORT}/api/generate-story`);
    console.log(`🌐 Public URL: https://learning-words-backend.onrender.com`);
});

module.exports = app;