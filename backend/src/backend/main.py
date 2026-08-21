from fastapi import FastAPI

app = FastAPI(
    title="Federated Clinical Platform API",
    version="0.1.0",
)

@app.get("/")
def root():
    return {
        "name": "Federated Clinical Platform API",
        "status": "running",
    }

@app.get("/health")
def health_check():
    return {"status": "healthy"}