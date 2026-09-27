"""Optional GPU worker: uvicorn scripts.flux_worker:app --host 127.0.0.1 --port 8002.

Install the optional environment from docs/REQUIREMENTS.md. Model loading is lazy;
no model is downloaded by the main Deckly installation or its test suite.
"""
from io import BytesIO
import os
import threading
from fastapi import FastAPI, HTTPException, Header, Response
from pydantic import BaseModel, Field
import secrets

app=FastAPI(docs_url=None,redoc_url=None)
lock=threading.Lock()
pipeline=None
MODEL='black-forest-labs/FLUX.1-schnell'

class ImageRequest(BaseModel):
    prompt: str=Field(min_length=3,max_length=1000)
    model: str=MODEL
    steps: int=4
    size: int=512

@app.post('/generate')
def generate(body: ImageRequest, authorization: str=Header('')):
    key=os.getenv('IMAGE_API_KEY','')
    if key and not secrets.compare_digest(authorization,'Bearer '+key):raise HTTPException(401,'Unauthorized')
    if body.model!=MODEL or body.size!=512 or body.steps!=4:raise HTTPException(422,'Unsupported configuration')
    if not lock.acquire(blocking=False):raise HTTPException(429,'Busy')
    try:
        global pipeline
        import torch
        from diffusers import FluxPipeline
        if not torch.cuda.is_available():raise HTTPException(503,'CUDA GPU required')
        if pipeline is None:
            pipeline=FluxPipeline.from_pretrained(MODEL,torch_dtype=torch.bfloat16)
            pipeline.enable_model_cpu_offload()
        result=pipeline(body.prompt,num_inference_steps=4,guidance_scale=0.0,max_sequence_length=256,height=512,width=512)
        stream=BytesIO();result.images[0].save(stream,format='PNG')
        return Response(stream.getvalue(),media_type='image/png')
    finally:lock.release()
