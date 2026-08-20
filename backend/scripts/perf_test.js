const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:8080');

const t0 = Date.now();
console.log(`[PERF] input_received: 0ms`);

let firstToken = false;
let firstResponse = false;

ws.on('open', () => {
    console.log(`[PERF] websocket_send: ${Date.now() - t0}ms`);
    ws.send(JSON.stringify({
        type: 'text_request',
        payload: { text: 'explain the process of photosynthesis', t0, speechEnabled: true }
    }));
});

ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    if (msg.type === 'ai_stream_chunk' && !firstToken) {
        firstToken = true;
        console.log(`[PERF] frontend_first_chunk_received: ${Date.now() - t0}ms`);
    }
    if (msg.type === 'ai_response') {
        firstResponse = true;
        console.log(`[PERF] frontend_received: ${Date.now() - t0}ms`);
        
        // Let it run a bit more to capture TTS logs in the backend
        setTimeout(() => {
            process.exit(0);
        }, 5000);
    }
});
