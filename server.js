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

// Endpoint principal - VERSIÓN SIMPLE Y FUNCIONAL
app.post('/api/generate-story', async (req, res) => {
    console.log('📨 Request received:', JSON.stringify(req.body, null, 2));
    
    try {
        const { 
            language = 'español', 
            theme = 'aventura', 
            keywords = [],
            context = '',
            category = '',
            level = ''
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
        let prompt;
        const isEnglish = language.toLowerCase().includes('ingl') || language.toLowerCase().includes('english');
        
        if (context && context.trim().length > 0) {
            prompt = `Escribe una historia en ${language} basada en este contexto: "${context}"
            
            ${keywords.length > 0 ? `Incluye estos elementos: ${keywords.join(', ')}` : ''}
            ${category ? `Categoría: ${category}` : ''}
            ${level ? `Nivel: ${level}` : ''}
            
            La historia debe tener 400-500 palabras.
            Incluye 10 preguntas de comprensión lectora con 4 opciones cada una.
            
            Responde SOLO con un objeto JSON en este formato:
            {
              "title": "Título de la historia",
              "content": "Texto completo de la historia aquí...",
              "questions": [
                {
                  "question": "Texto de la pregunta?",
                  "options": ["Opción A", "Opción B", "Opción C", "Opción D"],
                  "correctAnswer": 0,
                  "explanation": "Explicación breve"
                }
              ],
              "glossary": {
                "palabra1": "Definición simple",
                "palabra2": "Definición simple"
              }
            }`;
        } else {
            prompt = `Escribe una historia en ${language} sobre: ${theme}
            
            ${keywords.length > 0 ? `Incluye estos elementos: ${keywords.join(', ')}` : ''}
            ${category ? `Categoría: ${category}` : ''}
            ${level ? `Nivel: ${level}` : ''}
            
            La historia debe tener 400-500 palabras.
            Incluye 10 preguntas de comprensión lectora con 4 opciones cada una.
            Incluye un glosario con 20-25 palabras importantes para aprendices del idioma.
            
            Responde SOLO con un objeto JSON en este formato:
            {
              "title": "Título creativo",
              "content": "Texto completo de la historia aquí...",
              "questions": [
                {
                  "question": "Texto de la pregunta?",
                  "options": ["Opción A", "Opción B", "Opción C", "Opción D"],
                  "correctAnswer": 0,
                  "explanation": "Explicación breve"
                }
              ],
              "glossary": {
                "palabra1": "Definición simple",
                "palabra2": "Definición simple"
              }
            }
            
            IMPORTANTE: Para "correctAnswer" usa NÚMEROS: 0 para la primera opción, 1 para la segunda, etc.`;
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