FROM pytorch/pytorch:2.6.0-cuda12.4-cudnn9-runtime

RUN apt-get -y update \
    && apt-get install -y --no-install-recommends git ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace

COPY Mapperatorinator /workspace/Mapperatorinator
COPY web/scripts/aws_batch_worker.py /workspace/osu-gpt/aws_batch_worker.py

RUN pip install --no-cache-dir \
    spotdl \
    boto3 \
    accelerate==1.12.0 \
    pydub==0.25.1 \
    nnAudio==0.3.4 \
    PyYAML==6.0.3 \
    transformers==4.57.3 \
    hydra-core==1.3.2 \
    tensorboard==2.20.0 \
    "slider @ git+https://github.com/OliBomby/slider.git@gedagedigedagedaoh" \
    torch_tb_profiler==0.4.3 \
    wandb==0.23.1 \
    pandas==2.3.3 \
    pyarrow==22.0.0 \
    einops==0.8.1 \
    lightning==2.6.0 \
    peft==0.18.1 \
    rosu-pp-py==3.1.0

ENV PYTHONUNBUFFERED=1
WORKDIR /workspace/Mapperatorinator
ENTRYPOINT ["python", "/workspace/osu-gpt/aws_batch_worker.py"]
