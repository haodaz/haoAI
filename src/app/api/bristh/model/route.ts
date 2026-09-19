import { NextResponse } from 'next/server';
import { MODEL_REGISTRY, DEFAULT_MODEL_ID, getSelectedModelId, setSelectedModelId } from '@/lib/model-registry';

export const dynamic = 'force-dynamic';

// GET: Return current model selection + available models
export async function GET() {
  try {
    const currentModelId = await getSelectedModelId();
    const currentModel = MODEL_REGISTRY[currentModelId] || MODEL_REGISTRY[DEFAULT_MODEL_ID];
    
    const available = Object.values(MODEL_REGISTRY).map(m => ({
      id: m.id,
      name: m.name,
      provider: m.provider,
      hasKey: !!process.env[m.apiKeyEnv],
    }));
    
    return NextResponse.json({
      current: {
        id: currentModel.id,
        name: currentModel.name,
        provider: currentModel.provider,
      },
      available,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PUT: Switch model
export async function PUT(req: Request) {
  try {
    const { modelId } = await req.json();
    
    if (!MODEL_REGISTRY[modelId]) {
      return NextResponse.json({ error: `Unknown model: ${modelId}` }, { status: 400 });
    }
    
    const config = MODEL_REGISTRY[modelId];
    const hasKey = !!process.env[config.apiKeyEnv];
    
    if (!hasKey) {
      return NextResponse.json({ 
        error: `API key not configured for ${config.name}. Set ${config.apiKeyEnv} in .env.local` 
      }, { status: 400 });
    }
    
    await setSelectedModelId(modelId);
    
    return NextResponse.json({ 
      success: true, 
      model: { id: config.id, name: config.name, provider: config.provider } 
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
