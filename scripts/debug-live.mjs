async function main() {
  const tokenRes = await fetch('http://localhost:8080/api/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ language: 'hinglish', mode: 'reactive' })
  });
  const data = await tokenRes.json();
  console.log('Session response:', data);

  const { token, model, apiVersion } = data;
  const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.${apiVersion}.GenerativeService.BidiGenerateContentConstrained?access_token=${token}`;

  console.log('Connecting to wsUrl...');
  const ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log('CONNECTED! Sending setup...');
    ws.send(JSON.stringify({
      setup: {
        model: `models/${model}`,
      }
    }));
  };

  ws.onmessage = async (e) => {
    const text = typeof e.data === 'string' ? e.data : await e.data.text();
    const msg = JSON.parse(text);
    console.log('INCOMING MESSAGE KEYS:', Object.keys(msg));

    if (msg.setupComplete) {
      console.log('--> setupComplete received! Sending greeting trigger...');
      ws.send(JSON.stringify({
        clientContent: {
          turns: [
            {
              role: 'user',
              parts: [{ text: 'Namaste Asha, please greet me.' }]
            }
          ],
          turnComplete: true
        }
      }));
    }

    if (msg.toolCall) {
      console.log('--> Tool call received:', msg.toolCall.functionCalls[0]);
      // Execute tool via localhost:8080
      const fc = msg.toolCall.functionCalls[0];
      const toolRes = await fetch(`http://localhost:8080/api/tools/${fc.name}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fc.args || {})
      });
      const toolData = await toolRes.json();
      console.log('--> Tool result:', toolData);

      ws.send(JSON.stringify({
        toolResponse: {
          functionResponses: [
            {
              id: fc.id,
              name: fc.name,
              response: { result: toolData.data || { ok: true } }
            }
          ]
        }
      }));
    }

    if (msg.serverContent) {
      console.log('--> serverContent details:', JSON.stringify(msg.serverContent).substring(0, 300));
    }
  };

  ws.onerror = (err) => {
    console.error('WebSocket Error:', err);
  };

  ws.onclose = (e) => {
    console.log('WebSocket Closed:', e.code, e.reason);
  };

  setTimeout(() => {
    console.log('Test complete. Closing.');
    ws.close();
    process.exit(0);
  }, 10000);
}

main().catch(console.error);
