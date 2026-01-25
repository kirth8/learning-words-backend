const express = require('express');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());

// Health check mejorado
app.get('/', (req, res) => {
    res.json({ 
        status: 'online',
        service: 'Story Generator API',
        deployedOn: 'Render.com',
        timeout: '60 seconds',
        endpoints: {
            generateStory: 'POST /api/generate-story',
            health: 'GET /health'
        },
        note: 'Use POST /api/generate-story with {language, theme, keywords, context?, category?, level?}'
    });
});

// Endpoint de salud con métricas
app.get('/health', (req, res) => {
    const memoryUsage = process.memoryUsage();
    res.json({
        status: 'healthy',
        uptime: `${Math.floor(process.uptime())}s`,
        memory: {
            rss: `${Math.round(memoryUsage.rss / 1024 / 1024)}MB`,
            heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
            heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`
        },
        environment: process.env.NODE_ENV || 'development',
        timestamp: new Date().toISOString()
    });
});

// ==================== FUNCIONES AUXILIARES ====================

function generateStoryId(theme, language) {
    const slug = theme.toLowerCase()
        .replace(/[^a-z0-9áéíóúñü]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
    const langCode = language.toLowerCase().includes('ingl') || language.toLowerCase().includes('english') ? 'en' : 'es';
    const timestamp = Date.now().toString(36);
    return `${slug}-${langCode}-${timestamp}`;
}

function normalizeQuestions(questions, language) {
    if (!questions || !Array.isArray(questions)) {
        return [];
    }
    
    const isEnglish = language.toLowerCase().includes('ingl') || language.toLowerCase().includes('english');
    const optionLabels = isEnglish 
        ? ['Option A', 'Option B', 'Option C', 'Option D']
        : ['Opción A', 'Opción B', 'Opción C', 'Opción D'];
    
    return questions.map((question, index) => {
        // Determinar índice de respuesta correcta
        let correctIndex = 0;
        
        // Buscar correctAnswer primero (nuestra convención)
        if (question.correctAnswer !== undefined) {
            const answer = question.correctAnswer;
            if (typeof answer === 'number' && answer >= 0 && answer <= 3) {
                correctIndex = answer;
            } else if (typeof answer === 'string') {
                const upper = answer.toUpperCase();
                if (upper === 'A') correctIndex = 0;
                else if (upper === 'B') correctIndex = 1;
                else if (upper === 'C') correctIndex = 2;
                else if (upper === 'D') correctIndex = 3;
                else correctIndex = parseInt(answer) || 0;
            }
        }
        // Fallback a 'correct' (antigua convención)
        else if (question.correct !== undefined) {
            correctIndex = parseInt(question.correct) || 0;
        }
        
        // Asegurar rango válido (0-3)
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
        
        // Limpiar texto de opciones
        options = options.map(opt => {
            if (typeof opt === 'string') {
                return opt.trim();
            }
            return String(opt);
        });
        
        return {
            id: question.id || `q${index + 1}`,
            question: (question.question || (isEnglish ? `Question ${index + 1}` : `Pregunta ${index + 1}`)).trim(),
            options: options,
            correctAnswer: correctIndex,
            explanation: (question.explanation || 
                (isEnglish ? "Correct answer based on story context." : "Respuesta correcta según el contexto de la historia.")).trim()
        };
    });
}

function extractPotentialDifficultWords(text, language, existingGlossary = {}) {
    if (!text || typeof text !== 'string') return [];
    
    const isEnglish = language.toLowerCase().includes('ingl') || language.toLowerCase().includes('english');
    
    // Lista de palabras comunes que NO incluir (pueden ser problemáticas igualmente)
    const commonWords = isEnglish 
        ? [
            'the', 'and', 'was', 'were', 'have', 'has', 'that', 'this', 'with', 'from', 'they', 'their',
            'are', 'for', 'not', 'but', 'what', 'all', 'were', 'when', 'your', 'there', 'their', 'about'
        ]
        : [
            'el', 'la', 'los', 'las', 'un', 'una', 'y', 'de', 'que', 'en', 'con', 'por', 'para', 'se',
            'del', 'al', 'lo', 'como', 'más', 'pero', 'sus', 'le', 'ya', 'o', 'este', 'esta', 'es', 'son'
        ];
    
    // Extraer todas las palabras
    const words = text.toLowerCase()
        .replace(/[^\w\sáéíóúñüÁÉÍÓÚÑÜ]/g, ' ') // Mantener acentos en minúsculas y mayúsculas
        .split(/\s+/)
        .filter(word => {
            // Filtros para palabras relevantes
            return word.length >= 4 && // Palabras de al menos 4 letras
                   !commonWords.includes(word) && // No palabras comunes
                   !existingGlossary[word] && // No ya en glosario
                   /[a-záéíóúñü]/.test(word) && // Contiene letras
                   !/\d/.test(word); // No números
        });
    
    // Contar frecuencia y obtener únicas
    const wordCount = {};
    words.forEach(word => {
        wordCount[word] = (wordCount[word] || 0) + 1;
    });
    
    // Ordenar por frecuencia (más frecuente primero) y tomar hasta 25
    return Object.entries(wordCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 25)
        .map(entry => entry[0]);
}

function normalizeGlossary(glossary, content, language) {
    const normalized = {};
    
    // Primero, normalizar el glosario proporcionado por la IA
    if (glossary && typeof glossary === 'object') {
        Object.entries(glossary).forEach(([word, definition]) => {
            if (word && definition && typeof definition === 'string') {
                const cleanWord = word.trim().toLowerCase();
                const cleanDef = definition.trim();
                if (cleanWord && cleanDef && cleanDef.length > 3) {
                    normalized[cleanWord] = cleanDef;
                }
            }
        });
    }
    
    // Si el glosario tiene menos de 20 palabras, extraer más del contenido
    if (Object.keys(normalized).length < 20 && content) {
        const extractedWords = extractPotentialDifficultWords(content, language, normalized);
        
        extractedWords.forEach(word => {
            if (!normalized[word] && Object.keys(normalized).length < 30) {
                // Definición contextual genérica (la IA debería dar mejores)
                const isEnglish = language.toLowerCase().includes('ingl') || language.toLowerCase().includes('english');
                normalized[word] = isEnglish 
                    ? `Important word from the story. Context: "${content.substring(
                        Math.max(0, content.toLowerCase().indexOf(word) - 30),
                        Math.min(content.length, content.toLowerCase().indexOf(word) + 30)
                    )}..."`
                    : `Palabra importante de la historia. Contexto: "${content.substring(
                        Math.max(0, content.toLowerCase().indexOf(word) - 30),
                        Math.min(content.length, content.toLowerCase().indexOf(word) + 30)
                    )}..."`;
            }
        });
    }
    
    return normalized;
}

function ensure10Questions(questions, language) {
    const isEnglish = language.toLowerCase().includes('ingl') || language.toLowerCase().includes('english');
    
    while (questions.length < 10) {
        const qIndex = questions.length + 1;
        questions.push({
            id: `q${qIndex}`,
            question: isEnglish 
                ? `Comprehension question ${qIndex} about the story`
                : `Pregunta de comprensión ${qIndex} sobre la historia`,
            options: isEnglish
                ? ['Option A', 'Option B', 'Option C', 'Option D']
                : ['Opción A', 'Opción B', 'Opción C', 'Opción D'],
            correctAnswer: 0,
            explanation: isEnglish
                ? 'Refer to the story text for context.'
                : 'Consulta el texto de la historia para contexto.'
        });
    }
    
    // Limitar a 10 exactamente
    if (questions.length > 10) {
        return questions.slice(0, 10);
    }
    
    return questions;
}

function normalizeStoryResponse(aiResponse, language, theme, category, level) {
    const isEnglish = language.toLowerCase().includes('ingl') || language.toLowerCase().includes('english');
    
    // Valores por defecto inteligentes
    const defaultLevel = level || (isEnglish ? 'Intermediate' : 'Intermedio');
    const defaultCategory = category || (isEnglish ? 'Adventure' : 'Aventura');
    const defaultEstimatedMinutes = Math.max(5, Math.min(15, Math.ceil((aiResponse.content || '').split(/\s+/).length / 50)));
    
    // Estructura base
    const story = {
        id: generateStoryId(theme, language),
        title: aiResponse.title || (isEnglish ? `Story: ${theme}` : `Historia: ${theme}`),
        content: aiResponse.content || aiResponse.story || '',
        level: aiResponse.level || defaultLevel,
        estimatedReadingMinutes: aiResponse.estimatedReadingMinutes || aiResponse.estimatedMin || defaultEstimatedMinutes,
        category: aiResponse.category || defaultCategory,
        questions: [],
        glossary: {},
        language: isEnglish ? 'en' : 'es'
    };
    
    // Normalizar preguntas
    if (aiResponse.questions && Array.isArray(aiResponse.questions)) {
        story.questions = normalizeQuestions(aiResponse.questions, language);
    }
    
    // Asegurar 10 preguntas
    story.questions = ensure10Questions(story.questions, language);
    
    // Normalizar glosario (CRÍTICO - lo más amplio posible)
    story.glossary = normalizeGlossary(aiResponse.glossary, story.content, language);
    
    return story;
}

function buildPrompt(language, theme, keywords, context, category, level) {
    const isEnglish = language.toLowerCase().includes('ingl') || language.toLowerCase().includes('english');
    
    // Determinar nivel si no se especifica
    const determinedLevel = level || (isEnglish ? 'Intermediate' : 'Intermedio');
    
    // Construir la parte temática
    let themePart;
    if (context && context.trim().length > 0) {
        themePart = `USER CONTEXT: "${context}"`;
    } else {
        themePart = `THEME: "${theme}"`;
    }
    
    // Construir prompt detallado
    const prompt = `${themePart}
${keywords.length > 0 ? `KEYWORDS TO INCLUDE: ${keywords.join(', ')}` : ''}
${category ? `CATEGORY: ${category}` : ''}
LANGUAGE: ${language}
DIFFICULTY LEVEL: ${determinedLevel}

GENERATE A COMPLETE LANGUAGE LEARNING STORY WITH:

1. STORY TEXT: 400-600 words, engaging narrative suitable for language learners
2. COMPREHENSION QUESTIONS: 10 multiple-choice questions testing different comprehension levels
3. VOCABULARY GLOSSARY: 25-35 words with clear, contextual definitions

CRITICAL REQUIREMENTS:
- Questions must use "correctAnswer" with NUMBER 0-3 (0=first option, 1=second, etc.)
- Include BOTH simple and complex words in glossary (think like a language learner)
- Glossary should include: nouns, verbs, adjectives, adverbs, idioms, and expressions
- Ensure glossary covers words that might be difficult for A2-B2 level learners
- Story should be culturally appropriate and educational

OUTPUT FORMAT (STRICT JSON ONLY):
{
  "title": "Creative title here",
  "content": "Full story text here...",
  "level": "${determinedLevel}",
  "estimatedReadingMinutes": 8,
  "category": "${category || (isEnglish ? 'Adventure' : 'Aventura')}",
  "questions": [
    {
      "question": "Question text?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctAnswer": 0,
      "explanation": "Brief explanation why this is correct"
    }
  ],
  "glossary": {
    "word1": "Clear, simple definition in context",
    "word2": "Clear, simple definition in context"
  }
}

GLOSSARY GUIDELINES:
1. Include common words that might be new to learners
2. Include specialized vocabulary related to the theme
3. Include phrasal verbs or expressions
4. Include adjectives and adverbs that add detail
5. Provide definitions that are EASY to understand

Remember: The glossary is CRUCIAL for language learners. Be generous and include many words.`;

    return prompt;
}

// ==================== ENDPOINT PRINCIPAL ====================

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
        
        // Validar keywords
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
        
        // Construir prompt optimizado
        const prompt = buildPrompt(language, theme, keywords, context, category, level);
        
        console.log(`🤖 Calling DeepSeek: ${language} - ${theme.substring(0, 50)}...`);
        
        const startTime = Date.now();
        
        // Llamada a DeepSeek con timeout amplio
        const response = await axios.post(
            'https://api.deepseek.com/v1/chat/completions',
            {
                model: 'deepseek-chat',
                messages: [
                    { 
                        role: 'system', 
                        content: 'You are an expert language teacher and storyteller. ALWAYS respond with VALID JSON. Use "correctAnswer" with numbers 0-3 for answer index. Create EXTENSIVE vocabulary glossary (25-35 words) for language learners.' 
                    },
                    { 
                        role: 'user', 
                        content: prompt 
                    }
                ],
                max_tokens: 2800, // Suficiente para historia larga + preguntas + glosario extenso
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
        console.log(`✅ DeepSeek responded in ${processingTime}ms, tokens: ${response.data.usage?.total_tokens || 'unknown'}`);
        
        // Parsear respuesta
        let aiResponse;
        try {
            aiResponse = JSON.parse(content);
        } catch (parseError) {
            console.warn('⚠️ JSON parse error, trying to extract JSON...');
            // Intentar extraer JSON de la respuesta
            const cleanContent = content
                .replace(/```json\s*/gi, '')
                .replace(/```\s*/gi, '')
                .trim();
            
            const jsonMatch = cleanContent.match(/(\{[\s\S]*\})/);
            if (jsonMatch) {
                try {
                    aiResponse = JSON.parse(jsonMatch[1]);
                } catch (secondError) {
                    console.error('❌ Could not parse JSON after extraction:', secondError.message);
                    aiResponse = {
                        title: `${language.includes('ingl') ? 'Story' : 'Historia'}: ${theme}`,
                        content: cleanContent,
                        questions: [],
                        glossary: {}
                    };
                }
            } else {
                console.error('❌ No JSON found in response');
                aiResponse = {
                    title: `${language.includes('ingl') ? 'Story' : 'Historia'}: ${theme}`,
                    content: cleanContent,
                    questions: [],
                    glossary: {}
                };
            }
        }
        
        // Normalizar respuesta completa
        const story = normalizeStoryResponse(aiResponse, language, theme, category, level);
        
        // Enviar respuesta exitosa
        res.json({
            success: true,
            data: story,
            meta: {
                generatedAt: new Date().toISOString(),
                model: 'deepseek-chat',
                tokensUsed: response.data.usage?.total_tokens || 0,
                processingTime: `${processingTime}ms`,
                deployedOn: 'Render.com',
                timeoutAvailable: '60 seconds',
                questionsCount: story.questions.length,
                glossaryCount: Object.keys(story.glossary).length,
                language: story.language,
                level: story.level,
                category: story.category,
                estimatedReadingMinutes: story.estimatedReadingMinutes
            }
        });
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        
        if (error.code === 'ECONNABORTED' || error.name === 'AbortError') {
            return res.status(504).json({
                success: false,
                error: 'DeepSeek timeout (took too long)',
                suggestion: 'Try with a simpler theme or fewer keywords',
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
            'GET /health': 'Server health with metrics',
            'POST /api/generate-story': 'Generate story with questions and glossary'
        }
    });
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`🚀 Story Generator API running on port ${PORT}`);
    console.log(`⏱️  Timeout: 60 seconds available`);
    console.log(`🔗 Health check: http://localhost:${PORT}/`);
    console.log(`🔧 Health metrics: http://localhost:${PORT}/health`);
    console.log(`📝 Endpoint: POST http://localhost:${PORT}/api/generate-story`);
    console.log(`🌐 Public URL: https://learning-words-backend.onrender.com`);
    console.log(`📚 Features: Stories + 10 questions + Extensive glossary`);
});

module.exports = app;