async function main() {
  const tokenRes = await fetch('http://localhost:8080/api/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ language: 'hinglish', mode: 'reactive' })
  });
  const data = await tokenRes.json();
  const { token, model, apiVersion } = data;
  const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.${apiVersion}.GenerativeService.BidiGenerateContentConstrained?access_token=${token}`;

  const ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log('WS OPEN. Sending setup...');
    ws.send(JSON.stringify({ setup: { model: `models/${model}` } }));
  };

  ws.onmessage = async (e) => {
    const text = typeof e.data === 'string' ? e.data : await e.data.text();
    const msg = JSON.parse(text);

    if (msg.setupComplete) {
      console.log('Setup complete! Streaming 40 audio chunks...');
      const int16 = new Int16Array(640);
      for (let i = 0; i < 640; i++) {
        int16[i] = Math.round(Math.sin(i / 5) * 15000);
      }
      const bytes = new Uint8Array(int16.buffer);
      let binary = '';
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const b64 = btoa(binary);

      for (let c = 0; c < 40; c++) {
        ws.send(JSON.stringify({
          realtimeInput: {
            mediaChunks: [{ mimeType: 'audio/pcm;rate=16000', data: b64 }]
          }
        }));
        await new Promise(r => setTimeout(r, 40));
      }
      console.log('Sent 40 chunks.');
    }

    if (msg.serverContent) {
      console.log('SERVER CONTENT:', Object.keys(msg.serverContent));
      if (msg.serverContent.modelTurn) {
        console.log('--> Model turn received!');
      }
      if (msg.serverContent.inputTranscription) {
        console.log('--> Input transcript:', msg.serverContent.inputTranscription.text);
      }
    }

    if (msg.toolCall) {
      console.log('--> Tool call:', msg.toolCall.functionCalls[0].name);
    }
  };

  ws.onerror = (err) => console.error('WS Error:', err);
  ws.onclose = (e) => console.log('WS Closed:', e.code, e.reason);

  setTimeout(() => {
    console.log('Finished.');
    ws.close();
    process.exit(0);
  }, 10000);
}

main().catch(console.error);

