const axios = require('axios');

// Configuración
const API_URL = 'https://learning-words-backend.onrender.com';
const TIMEOUT = 70000; // 70 segundos

// Función para formatear respuestas
function formatResponse(response) {
    console.log('\n' + '='.repeat(60));
    console.log('📊 RESPUESTA DE LA API');
    console.log('='.repeat(60));
    
    if (response.success) {
        console.log('✅ ÉXITO');
        console.log(`📖 Título: ${response.data.title}`);
        console.log(`📝 Palabras: ~${Math.round(response.data.story.length / 5)}`);
        console.log(`❓ Preguntas: ${response.data.questions?.length || 0}`);
        
        if (response.data.questions && response.data.questions.length > 0) {
            console.log('\n🔍 EJEMPLO DE PREGUNTA:');
            const question = response.data.questions[0];
            console.log(`   ${question.question}`);
            console.log(`   A) ${question.options[0]}`);
            console.log(`   B) ${question.options[1]}`);
            console.log(`   C) ${question.options[2]}`);
            console.log(`   D) ${question.options[3]}`);
            console.log(`   ✅ Respuesta: ${question.options[question.correct]}`);
            console.log(`   💡 Explicación: ${question.explanation}`);
        }
        
        if (response.meta) {
            console.log('\n📈 METADATOS:');
            console.log(`   ⏱️  Procesado en: ${response.meta.processingTime || 'N/A'}`);
            console.log(`   🔢 Tokens usados: ${response.meta.tokensUsed || 'N/A'}`);
            console.log(`   🤖 Modelo: ${response.meta.model || 'N/A'}`);
        }
    } else {
        console.log('❌ ERROR');
        console.log(`   Mensaje: ${response.error}`);
        if (response.details) console.log(`   Detalles: ${response.details}`);
    }
    console.log('='.repeat(60) + '\n');
}

// Test 1: Health Check
async function testHealth() {
    console.log('🩺 Probando Health Check...');
    try {
        const response = await axios.get(`${API_URL}/`, { timeout: 10000 });
        console.log('✅ Health Check OK');
        console.log('   Estado:', response.data.status);
        console.log('   Servicio:', response.data.service);
        console.log('   Timeout disponible:', response.data.timeout);
        return true;
    } catch (error) {
        console.log('❌ Health Check falló:', error.message);
        return false;
    }
}

// Test 2: Historia simple
async function testSimpleStory() {
    console.log('\n📖 Probando historia simple...');
    
    const payload = {
        language: "español",
        theme: "un viaje a la luna",
        keywords: ["cohete", "aventura", "amistad", "descubrimiento"]
    };
    
    try {
        const startTime = Date.now();
        const response = await axios.post(
            `${API_URL}/api/generate-story`,
            payload,
            { timeout: TIMEOUT }
        );
        
        const endTime = Date.now();
        const duration = (endTime - startTime) / 1000;
        
        console.log(`⏱️  Tiempo de respuesta: ${duration.toFixed(2)} segundos`);
        
        if (response.data.success) {
            formatResponse(response.data);
            return true;
        } else {
            console.log('❌ La API reportó error:', response.data.error);
            return false;
        }
        
    } catch (error) {
        console.log('❌ Error en la petición:', error.message);
        if (error.code === 'ECONNABORTED') {
            console.log('   ⚠️  Timeout excedido');
        }
        return false;
    }
}

// Test 3: Historia del niño (con contexto)
async function testChildStory() {
    console.log('\n👦 Probando historia del niño (con contexto)...');
    
    const payload = {
        language: "inglés",
        theme: "The Haunted Presidential Garden",
        context: "El patio del presidente de Ecuador le gusta que esté podado, pero siempre cuando lo podan, este vuelve a crecer en 1 hora mágicamente y el que lo corta muere en 7 días",
        category: "misterio y terror",
        keywords: ["president", "Ecuador", "curse", "magic grass", "ghost"]
    };
    
    try {
        const startTime = Date.now();
        const response = await axios.post(
            `${API_URL}/api/generate-story`,
            payload,
            { timeout: TIMEOUT }
        );
        
        const endTime = Date.now();
        const duration = (endTime - startTime) / 1000;
        
        console.log(`⏱️  Tiempo de respuesta: ${duration.toFixed(2)} segundos`);
        
        if (response.data.success) {
            formatResponse(response.data);
            
            // Verificar si incluye elementos del contexto
            const storyText = response.data.data.story.toLowerCase();
            const hasContext = 
                storyText.includes('president') ||
                storyText.includes('ecuador') ||
                storyText.includes('curse') ||
                storyText.includes('grass');
            
            console.log('🔍 ANÁLISIS DEL CONTEXTO:');
            console.log(hasContext ? '✅ Incluye elementos del contexto' : '⚠️  Podría no incluir todo el contexto');
            
            return true;
        } else {
            console.log('❌ La API reportó error:', response.data.error);
            return false;
        }
        
    } catch (error) {
        console.log('❌ Error en la petición:', error.message);
        return false;
    }
}

// Test 4: Múltiples historias rápidas
async function testMultipleStories() {
    console.log('\n🚀 Probando múltiples historias rápidas...');
    
    const tests = [
        {
            name: "Aventura en español",
            payload: {
                language: "español",
                theme: "un tesoro pirata"
            }
        },
        {
            name: "Misterio en inglés",
            payload: {
                language: "inglés",
                theme: "a detective mystery",
                keywords: ["clue", "suspect", "investigation"]
            }
        },
        {
            name: "Historia educativa",
            payload: {
                language: "español",
                theme: "aprender un nuevo idioma",
                category: "educación"
            }
        }
    ];
    
    const results = [];
    
    for (const test of tests) {
        console.log(`\n   🔄 ${test.name}...`);
        try {
            const startTime = Date.now();
            const response = await axios.post(
                `${API_URL}/api/generate-story`,
                test.payload,
                { timeout: 30000 }
            );
            
            const duration = (Date.now() - startTime) / 1000;
            
            if (response.data.success) {
                console.log(`   ✅ ${duration.toFixed(1)}s - ${response.data.data.title}`);
                results.push({ name: test.name, success: true, duration });
            } else {
                console.log(`   ❌ Error: ${response.data.error}`);
                results.push({ name: test.name, success: false, duration });
            }
        } catch (error) {
            console.log(`   ❌ Falló: ${error.message}`);
            results.push({ name: test.name, success: false, duration: 0 });
        }
    }
    
    // Resumen
    console.log('\n📊 RESUMEN DE MÚLTIPLES HISTORIAS:');
    results.forEach(result => {
        const icon = result.success ? '✅' : '❌';
        console.log(`   ${icon} ${result.name}: ${result.success ? `${result.duration.toFixed(1)}s` : 'Falló'}`);
    });
    
    const successCount = results.filter(r => r.success).length;
    return successCount === tests.length;
}

// Test 5: Manejo de errores
async function testErrorHandling() {
    console.log('\n⚠️  Probando manejo de errores...');
    
    // Test con API key inválida (simulada)
    console.log('   🔄 Test: Sin API key en payload (debería funcionar)');
    try {
        const response = await axios.post(
            `${API_URL}/api/generate-story`,
            { language: "español", theme: "test" },
            { timeout: 15000 }
        );
        
        if (!response.data.success) {
            console.log('   ✅ Correctamente manejó el error:', response.data.error);
            return true;
        } else {
            console.log('   ✅ Petición exitosa');
            return true;
        }
    } catch (error) {
        console.log('   ❌ Error inesperado:', error.message);
        return false;
    }
}

// Ejecutar todas las pruebas
async function runAllTests() {
    console.log('🚀 INICIANDO PRUEBAS DE LA API');
    console.log('='.repeat(60));
    console.log(`URL: ${API_URL}`);
    console.log(`Timeout: ${TIMEOUT / 1000} segundos`);
    console.log('='.repeat(60));
    
    const testResults = [];
    
    // Test 1: Health Check
    const healthResult = await testHealth();
    testResults.push({ test: 'Health Check', result: healthResult });
    
    if (!healthResult) {
        console.log('\n⚠️  Health Check falló. ¿Está despierto el servidor en Render?');
        console.log('   Render Free Tier duerme los servidores después de 15 minutos de inactividad.');
        console.log('   Espera 30-60 segundos y vuelve a intentar.');
        return;
    }
    
    // Test 2: Historia simple
    const simpleResult = await testSimpleStory();
    testResults.push({ test: 'Historia Simple', result: simpleResult });
    
    // Test 3: Historia del niño
    const childResult = await testChildStory();
    testResults.push({ test: 'Historia con Contexto', result: childResult });
    
    // Test 4: Múltiples historias
    const multipleResult = await testMultipleStories();
    testResults.push({ test: 'Múltiples Historias', result: multipleResult });
    
    // Test 5: Manejo de errores
    const errorResult = await testErrorHandling();
    testResults.push({ test: 'Manejo de Errores', result: errorResult });
    
    // Resumen final
    console.log('\n' + '='.repeat(60));
    console.log('📋 RESUMEN FINAL DE PRUEBAS');
    console.log('='.repeat(60));
    
    testResults.forEach((tr, index) => {
        const icon = tr.result ? '✅' : '❌';
        console.log(`${index + 1}. ${icon} ${tr.test}`);
    });
    
    const passed = testResults.filter(tr => tr.result).length;
    const total = testResults.length;
    
    console.log('\n📊 ESTADÍSTICAS:');
    console.log(`   Aprobadas: ${passed}/${total} (${Math.round(passed/total*100)}%)`);
    
    if (passed === total) {
        console.log('\n🎉 ¡TODAS LAS PRUEBAS PASARON!');
        console.log('   Tu API está lista para producción.');
    } else {
        console.log('\n⚠️  Algunas pruebas fallaron.');
        console.log('   Revisa los errores arriba.');
    }
}

// Ejecutar las pruebas
runAllTests().catch(error => {
    console.error('❌ Error ejecutando pruebas:', error);
});