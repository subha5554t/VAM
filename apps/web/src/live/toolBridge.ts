export interface ToolEvent {
  type: 'tool';
  name: string;
  args: any;
  result: any;
  ms: number;
}

export async function callServerTool(name: string, args: any): Promise<{ ok: boolean; data?: any; error?: string; _executionMs?: number }> {
  try {
    const res = await fetch(`/api/tools/${name}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(args || {}),
    });

    const json = await res.json();
    return json;
  } catch (err: any) {
    return {
      ok: false,
      error: err.message || `Failed to call tool ${name}`,
    };
  }
}

