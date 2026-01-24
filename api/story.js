const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();

// 1. MIDDLEWARE BÁSICO
app.use(cors());
app.use(express.json());

// 2. RATE LIMITING SIMPLE (IMPORTANTE)
const requestCounts = new Map(); // { ip: {count: number, lastReset: timestamp} }

const checkRateLimit = (ip) => {
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    
    if (!requestCounts.has(ip)) {
        requestCounts.set(ip, { count: 1, lastReset: now });
        return true; // Permitir
    }
    
    const userData = requestCounts.get(ip);
    
    // Reiniciar contador si pasó 1 hora
    if (now - userData.lastReset > oneHour) {
        userData.count = 1;
        userData.lastReset = now;
        return true;
    }
    
    // Verificar límite (30 peticiones por hora)
    if (userData.count >= 30) {
        return false; // Bloquear
    }
    
    userData.count++;
    return true;
};

// 3. HEALTH CHECK
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        time: new Date().toISOString(),
        note: 'DeepSeek Story Generator API'
    });
});

// 4. ENDPOINT PRINCIPAL CON RATE LIMITING
app.post('/api/generate-story', async (req, res) => {
    try {
        // Aplicar rate limiting
        const clientIP = req.ip || req.connection.remoteAddress;
        if (!checkRateLimit(clientIP)) {
            return res.status(429).json({
                error: 'Límite de peticiones alcanzado',
                message: 'Máximo 30 historias por hora. Intenta más tarde.'
            });
        }
        
        // Obtener datos
        const { 
            language = 'español', 
            theme = 'aventura',
            keywords = [],
            context = '',      
            category = ''      
            } = req.body;
        
        if (!language) {
            return res.status(400).json({ error: 'El idioma es requerido' });
        }
        
        // Prompt simple y claro
        const prompt = `Eres un escritor de historias de toda clase de genero.

        IDIOMA de la historia: ${language}
        TEMA PRINCIPAL: ${theme}

        CONTEXTO ESPECÍFICO PROPORCIONADO POR EL USUARIO:
        ${context ? context : 'No se proporcionó contexto adicional'}

        ${keywords.length ? `ELEMENTOS A INCLUIR: ${keywords.join(', ')}` : ''}

        INSTRUCCIONES:
        1. Crea una historia ORIGINAL basada en el contexto proporcionado
        2. Mantén la esencia del contexto pero añade creatividad
        3. Genera 10 preguntas de comprensión con 4 opciones cada una
        4. Asegúrate de que las preguntas cubran detalles importantes de la historia

        RESPONDE SOLO CON ESTE JSON:
        {
        "title": "Título creativo basado en el tema",
        "story": "Historia completa aquí...",
        "questions": [
            {
            "question": "¿Pregunta 1?",
            "options": ["Opción A", "Opción B", "Opción C", "Opción D"],
            "correct": 0,
            "explanation": "Explicación breve"
            }
        ]
        }`;
        
        // Llamar a DeepSeek
        const apiKey = process.env.DEEPSEEK_API_KEY;
        
        if (!apiKey || apiKey === 'test_mode') {
            return res.status(500).json({ 
                error: 'API key no configurada',
                solution: 'Agrega tu API key de DeepSeek en el archivo .env'
            });
        }
        
        const response = await axios.post(
            'https://api.deepseek.com/v1/chat/completions',
            {
                model: 'deepseek-chat',
                messages: [
                    { role: 'system', content: 'Responde siempre en formato JSON.' },
                    { role: 'user', content: prompt }
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
                timeout: 40000
            }
        );
        
        // Parsear respuesta
        const content = response.data.choices[0].message.content;
        let result;
        
        try {
            result = JSON.parse(content);
        } catch {
            // Si falla, buscar JSON en el texto
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                result = JSON.parse(jsonMatch[0]);
            } else {
                throw new Error('La IA no devolvió JSON válido');
            }
        }
        
        // Éxito
        res.json({
            success: true,
            data: result,
            meta: {
                generated: new Date().toISOString(),
                tokens: response.data.usage?.total_tokens || 0
            }
        });
        
    } catch (error) {
    console.error('❌ Error COMPLETO:', error);
    
    // Agrega esta información de debug
    console.log('🔍 Detalles del error:');
    console.log('- Tipo:', error.name);
    console.log('- Mensaje:', error.message);
    console.log('- Código:', error.code);
    console.log('- Status:', error.response?.status);
    console.log('- Status Text:', error.response?.statusText);
    console.log('- Datos respuesta:', error.response?.data);
    
    // ... resto del código de error
}
});

// 5. INICIAR SERVIDOR
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ API lista: http://localhost:${PORT}`);
    console.log(`Rate limiting: 30 peticiones/hora por IP`);
});

module.exports = app;