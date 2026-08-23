## Local demo flow

Prepare the 50/50 training and presentation split once:

```bash
uv run prepare-data
```

Start the Flower bridge in one terminal:

```bash
PORT=8001 uv run federated-service
```

Start the backend in another terminal and the frontend in a third. A local hospital can then add its daily held-out patient batch at `/patients`. A user whose PostgreSQL `users.role` is `global` sees `/global`; its control starts the backend round, which calls the Flower bridge, stores model-update events in PostgreSQL, and exposes the round status for polling. The broadcast control records the global model sync for the participating hospitals.
