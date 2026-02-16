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

// Endpoint de salud
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// Endpoint principal - Traer la historia y cuestionario
app.post('/api/generate-story', async (req, res) => {
    console.log('📨 Request received:', JSON.stringify(req.body, null, 2));
    
    try {
        const { 
            language = 'español', 
            theme = 'aventura', 
            keywords = [],
            context = '',
            category = '',
            level = '',
            glossaryLanguage = 'español' 
        } = req.body;
        
        // Validaciones básicas
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
        
        const apiKey = process.env.DEEPSEEK_API_KEY;
        if (!apiKey) {
            console.error('❌ API key not configured');
            return res.status(500).json({ 
                success: false,
                error: 'API key not configured on Render. Add DEEPSEEK_API_KEY environment variable.' 
            });
        }
        
        // Construir prompt SIMPLE pero efectivo

        // Determinar idioma opuesto para el glosario
        let prompt;
        const isEnglish = language.toLowerCase().includes('ingl') || language.toLowerCase().includes('english');
        
        if (context && context.trim().length > 0) {
            prompt = `Escribe una historia en el idioma ${language} basada en este contexto: "${context}"
            
            ${keywords.length > 0 ? `Incluye estos elementos: ${keywords.join(', ')}` : ''}
            ${category ? `Categoría: ${category}` : ''}
            ${level ? `Nivel: ${level}` : ''}
            
            La historia debe tener 200-300 palabras para el nivel basico, y 400-500 palabras para niveles intermedios o Avanzados.
            Incluye 10 preguntas de comprensión lectora con 4 opciones cada una.
            Incluye un glosario con 20-25 palabras importantes de la historia y que se encuentren estas palabras en ella, con definiciones claras en el idioma ${glossaryLanguage} (el idioma del sistema del usuario).
            
            Responde SOLO con un objeto JSON en este formato:
            {
              "title": "Título de la historia",
              "content": "Texto completo de la historia aquí...",
              "questions": [
                {
                  "question": "Texto de la pregunta?",
                  "options": ["Opción A", "Opción B", "Opción C", "Opción D"],
                  "correctAnswer": 1, // Ejemplo: usa un índice variado 0-3
                  "explanation": "Explicación breve pero explicativa"
                }
              ],
              "glossary": {
                "palabra1": "Definición corta pero explicativa",
                "palabra2": "Definición corta pero explicativa"
              }
            }
            IMPORTANTE: Para "correctAnswer" usa NÚMEROS aleatorios entre 0 y 3. No pongas siempre la respuesta correcta en la misma posición.`;
        } else {
            prompt = `Escribe una historia en el idioma ${language} sobre: ${theme}
            
            ${keywords.length > 0 ? `Incluye estos elementos: ${keywords.join(', ')}` : ''}
            ${category ? `Categoría: ${category}` : ''}
            ${level ? `Nivel: ${level}` : ''}
            
            La historia debe tener 200-300 palabras para el nivel basico, y 400-500 palabras para niveles intermedios o Avanzados, en el idioma ${language}
            Incluye 10 preguntas de comprensión lectora con 4 opciones cada una en ${language}
            Incluye un glosario con 20-25 palabras importantes de la historia y que se encuentren estas palabras en ella, con definiciones claras en el idioma ${glossaryLanguage} (el idioma del sistema del usuario).
            
            Responde SOLO con un objeto JSON en este formato:
            {
              "title": "Título creativo",
              "content": "Texto completo de la historia aquí...",
              "questions": [
                {
                  "question": "Texto de la pregunta?",
                  "options": ["Opción A", "Opción B", "Opción C", "Opción D"],
                  "correctAnswer": 2, // Ejemplo: usa un índice variado 0-3
                  "explanation": "Explicación breve pero explicativa"
                }
              ],
              "glossary": {
                "palabra1": "Definición corta pero explicativa",
                "palabra2": "Definición corta pero explicativa"
              }
            }
            
            IMPORTANTE: Para "correctAnswer" usa NÚMEROS aleatorios entre 0 y 3. Varía la posición de la respuesta correcta en cada pregunta.`;
        }
        
        console.log(`🤖 Calling DeepSeek: ${language} - ${theme.substring(0, 50)}...`);
        
        const startTime = Date.now();
        
        // Llamada a DeepSeek
        const response = await axios.post(
            'https://api.deepseek.com/v1/chat/completions',
            {
                model: 'deepseek-chat',
                messages: [
                    { 
                        role: 'system', 
                        content: 'Eres un asistente que siempre responde con JSON válido. Usa "correctAnswer" con números 0-3 para indicar la opción correcta (0=A, 1=B, 2=C, 3=D).' 
                    },
                    { 
                        role: 'user', 
                        content: prompt 
                    }
                ],
                max_tokens: 3000,
                temperature: 0.7,
                response_format: { type: "json_object" }
            },
            {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 55000
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
            console.error('❌ JSON parse error:', parseError.message);
            // Intentar extraer JSON si está dentro de markdown
            const jsonMatch = content.match(/```json\n?([\s\S]*?)\n?```/) || content.match(/(\{[\s\S]*\})/);
            if (jsonMatch) {
                try {
                    const jsonText = jsonMatch[1] || jsonMatch[0];
                    result = JSON.parse(jsonText);
                } catch (e) {
                    console.error('❌ Could not extract JSON');
                    result = {
                        title: isEnglish ? `Story: ${theme}` : `Historia: ${theme}`,
                        content: content,
                        questions: [],
                        glossary: {}
                    };
                }
            } else {
                result = {
                    title: isEnglish ? `Story: ${theme}` : `Historia: ${theme}`,
                    content: content,
                    questions: [],
                    glossary: {}
                };
            }
        }
        
        // Validar y completar estructura
        const finalResult = {
            id: `story-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            title: result.title || (isEnglish ? `Story: ${theme}` : `Historia: ${theme}`),
            content: result.content || result.story || '',
            level: result.level || level || (isEnglish ? 'Intermediate' : 'Intermedio'),
            estimatedReadingMinutes: result.estimatedReadingMinutes || result.estimatedMin || 8,
            category: result.category || category || (isEnglish ? 'Adventure' : 'Aventura'),
            questions: [],
            glossary: result.glossary || {},
            language: isEnglish ? 'en' : 'es'
        };
        
        // Procesar preguntas
        if (result.questions && Array.isArray(result.questions)) {
            finalResult.questions = result.questions.map((q, idx) => ({
                id: `q${idx + 1}`,
                question: q.question || (isEnglish ? `Question ${idx + 1}` : `Pregunta ${idx + 1}`),
                options: q.options || (isEnglish 
                    ? ['Option A', 'Option B', 'Option C', 'Option D']
                    : ['Opción A', 'Opción B', 'Opción C', 'Opción D']),
                correctAnswer: typeof q.correctAnswer === 'number' ? q.correctAnswer : 0,
                explanation: q.explanation || (isEnglish 
                    ? 'Correct answer based on the story.' 
                    : 'Respuesta correcta según la historia.')
            }));
        }
        
        // Asegurar 10 preguntas
        while (finalResult.questions.length < 10) {
            finalResult.questions.push({
                id: `q${finalResult.questions.length + 1}`,
                question: isEnglish 
                    ? `Comprehension question ${finalResult.questions.length + 1} about the story`
                    : `Pregunta de comprensión ${finalResult.questions.length + 1} sobre la historia`,
                options: isEnglish
                    ? ['Option A', 'Option B', 'Option C', 'Option D']
                    : ['Opción A', 'Opción B', 'Opción C', 'Opción D'],
                correctAnswer: 0,
                explanation: isEnglish
                    ? 'Refer to the story for context.'
                    : 'Consulta la historia para contexto.'
            });
        }
        
        // Limitar a 10 preguntas
        finalResult.questions = finalResult.questions.slice(0, 10);
        
        // Enviar respuesta
        res.json({
            success: true,
            data: finalResult,
            meta: {
                generatedAt: new Date().toISOString(),
                model: 'deepseek-chat',
                tokensUsed: response.data.usage?.total_tokens || 0,
                processingTime: `${processingTime}ms`,
                deployedOn: 'Render.com'
            }
        });
        
    } catch (error) {
        console.error('❌ Error details:', error.message);
        console.error('❌ Error stack:', error.stack);
        
        if (error.code === 'ECONNABORTED') {
            return res.status(504).json({
                success: false,
                error: 'Request timeout',
                suggestion: 'Try with a simpler theme'
            });
        }
        
        if (error.response?.status === 402) {
            return res.status(402).json({
                success: false,
                error: 'Insufficient API balance',
                solution: 'Add credit at platform.deepseek.com'
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
            details: error.message,
            suggestion: 'Check server logs'
        });
    }
});

//Endpoint secundario - Para poder traer las preguntes acorde las palabras dadas

app.post('/api/generate-vocab-quiz', async (req, res) => {
    console.log('📚 Vocab Quiz request:', req.body);
    
    try {
        const { 
            words = []  // Array de objetos: [{word: "house", language: "en"}, ...]
        } = req.body;
        
        // Validaciones básicas
        if (!Array.isArray(words) || words.length === 0) {
            return res.status(400).json({ 
                success: false,
                error: 'Words is required and must be a non-empty array' 
            });
        }
        
        const apiKey = process.env.DEEPSEEK_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ 
                success: false,
                error: 'API key not configured' 
            });
        }
        
        // Agrupar palabras por idioma para el prompt
        const englishWords = words.filter(w => w.language === 'en').map(w => w.word);
        const spanishWords = words.filter(w => w.language === 'es').map(w => w.word);
        
        // Construir prompt MUY simple
        const prompt = `Create exactly 15 vocabulary multiple-choice questions.

WORDS PROVIDED:
${englishWords.length > 0 ? `English: ${englishWords.join(', ')}` : ''}
${spanishWords.length > 0 ? `Spanish: ${spanishWords.join(', ')}` : ''}

RULES:
1. Create 15 questions total
2. Each question must have 4 options (A, B, C, D)
3. For English words: create questions in English
4. For Spanish words: create questions in Spanish
5. Mix different question types: definitions, synonyms, usage, context
6. IMPORTANT: The correct answer (correctAnswer) must be randomized. Do NOT always put it in the same position. Distribute it among 0, 1, 2, and 3.

RESPONSE FORMAT (JSON only):
{
  "questions": [
    {
      "question": "Question text?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctAnswer": 3, // Example: randomize this index (0-3)
      "explanation": "A brief but informative explanation"
    }
  ]
}
  IMPORTANT: For "correctAnswer" use random numbers between 0 and 3. Vary the position of the correct answer in each question.`;

        console.log(`🤖 Generating 15 questions for ${words.length} words`);
        
        const startTime = Date.now();
        
        // Llamada a DeepSeek
        const response = await axios.post(
            'https://api.deepseek.com/v1/chat/completions',
            {
                model: 'deepseek-chat',
                messages: [
                    { 
                        role: 'system', 
                        content: 'Create 15 vocabulary questions. Always return valid JSON with "questions" array.' 
                    },
                    { 
                        role: 'user', 
                        content: prompt 
                    }
                ],
                max_tokens: 3000,
                temperature: 0.7,
                response_format: { type: "json_object" }
            },
            {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 35000
            }
        );
        
        const processingTime = Date.now() - startTime;
        const content = response.data.choices[0].message.content;
        console.log(`✅ Quiz generated in ${processingTime}ms`);
        
        // Parsear respuesta
        let result;
        try {
            result = JSON.parse(content);
        } catch {
            // Si falla, crear estructura básica
            result = { questions: [] };
        }
        
        // Estructura de respuesta simple
        const quiz = {
            id: `quiz-${Date.now()}`,
            title: "Vocabulary Quiz",
            questionCount: 15,
            words: words,
            questions: []
        };
        
        // Procesar preguntas
        if (result.questions && Array.isArray(result.questions)) {
            quiz.questions = result.questions.slice(0, 15).map((q, idx) => ({
                id: `q${idx + 1}`,
                question: q.question || `Question ${idx + 1}`,
                options: Array.isArray(q.options) ? q.options.slice(0, 4) : ['A', 'B', 'C', 'D'],
                correctAnswer: typeof q.correctAnswer === 'number' ? Math.max(0, Math.min(3, q.correctAnswer)) : 0,
                explanation: q.explanation || 'Correct answer'
            }));
        }
        
        // Asegurar 15 preguntas
        while (quiz.questions.length < 15) {
            quiz.questions.push({
                id: `q${quiz.questions.length + 1}`,
                question: `Vocabulary question ${quiz.questions.length + 1}`,
                options: ['Option A', 'Option B', 'Option C', 'Option D'],
                correctAnswer: 0,
                explanation: 'Select the correct option'
            });
        }
        
        // Respuesta
        res.json({
            success: true,
            data: quiz,
            meta: {
                generatedAt: new Date().toISOString(),
                processingTime: `${processingTime}ms`,
                tokensUsed: response.data.usage?.total_tokens || 0
            }
        });
        
    } catch (error) {
        console.error('❌ Quiz error:', error.message);
        res.status(500).json({
            success: false,
            error: 'Failed to generate quiz'
        });
    }
});

// Middleware para rutas no encontradas
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Endpoint not found',
        availableEndpoints: {
            'GET /': 'Health check',
            'GET /health': 'Server health',
            'POST /api/generate-story': 'Generate story'
        }
    });
});

app.listen(PORT, () => {
    console.log(`🚀 Story Generator API running on port ${PORT}`);
    console.log(`🌐 Public URL: https://learning-words-backend.onrender.com`);
});

module.exports = app;