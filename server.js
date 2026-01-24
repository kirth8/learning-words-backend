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
        }
    });
});

// Endpoint principal
app.post('/api/generate-story', async (req, res) => {
    console.log('📨 Request received:', req.body);
    
    try {
        const { 
            language = 'español', 
            theme = 'aventura', 
            keywords = [],
            context = '',
            category = ''
        } = req.body;
        
        if (!language || !theme) {
            return res.status(400).json({ error: 'Language and theme required' });
        }
        
        const apiKey = process.env.DEEPSEEK_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ error: 'API key not configured on Render' });
        }
        
        // Construir prompt inteligente
        let prompt;
        if (context && context.trim().length > 0) {
            prompt = `CONTEXT PROVIDED BY USER: "${context}"
            
            Based on this context, write a story in ${language}.
            ${category ? `Category: ${category}` : ''}
            ${keywords.length > 0 ? `Include these elements: ${keywords.join(', ')}` : ''}
            
            Requirements:
            1. Stay true to the provided context
            2. Develop characters and plot
            3. Make it engaging and educational
            4. Create 10 comprehension questions with 4 options each
            
            Respond ONLY with valid JSON:
            {
                "title": "Creative title",
                "story": "Full story here...",
                "questions": [
                    {
                        "question": "Question text?",
                        "options": ["A", "B", "C", "D"],
                        "correct": 0,
                        "explanation": "Brief explanation"
                    }
                ]
            }`;
        } else {
            prompt = `Write a story in ${language} about ${theme}.
            ${keywords.length > 0 ? `Include: ${keywords.join(', ')}.` : ''}
            ${category ? `Category: ${category}` : ''}
            
            Story should be 300-400 words.
            Include 5 comprehension questions with 4 options each.
            
            Respond ONLY with JSON:
            {
                "title": "Title here",
                "story": "Story here...",
                "questions": [...]
            }`;
        }
        
        console.log(`🤖 Calling DeepSeek: ${language} - ${theme.substring(0, 50)}...`);
        
        // Llamada a DeepSeek con 55 segundos timeout
        const response = await axios.post(
            'https://api.deepseek.com/v1/chat/completions',
            {
                model: 'deepseek-chat',
                messages: [
                    { 
                        role: 'system', 
                        content: 'You are a creative writer. Always respond with valid JSON.' 
                    },
                    { 
                        role: 'user', 
                        content: prompt 
                    }
                ],
                max_tokens: 2000,
                temperature: 0.7,
                response_format: { type: "json_object" }
            },
            {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 55000  // 55 segundos (Render da 60s)
            }
        );
        
        const content = response.data.choices[0].message.content;
        console.log('✅ DeepSeek responded successfully');
        
        let result;
        try {
            result = JSON.parse(content);
        } catch (parseError) {
            // Intentar extraer JSON
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                result = JSON.parse(jsonMatch[0]);
            } else {
                result = {
                    title: `Story: ${theme}`,
                    story: content,
                    questions: []
                };
            }
        }
        
        // Enviar respuesta
        res.json({
            success: true,
            data: result,
            meta: {
                generatedAt: new Date().toISOString(),
                model: 'deepseek-chat',
                tokensUsed: response.data.usage?.total_tokens || 0,
                deployedOn: 'Render.com',
                timeoutAvailable: '60 seconds'
            }
        });
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        
        if (error.code === 'ECONNABORTED') {
            return res.status(504).json({
                success: false,
                error: 'DeepSeek timeout (took too long)',
                suggestion: 'Try with a simpler story or fewer keywords'
            });
        }
        
        if (error.response?.status === 402) {
            return res.status(402).json({
                success: false,
                error: 'Insufficient DeepSeek balance',
                solution: 'Add credit at platform.deepseek.com'
            });
        }
        
        res.status(500).json({
            success: false,
            error: 'Failed to generate story',
            details: error.message
        });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Story Generator API running on port ${PORT}`);
    console.log(`⏱️  Timeout: 60 seconds available`);
    console.log(`🔗 Health check: http://localhost:${PORT}/`);
});