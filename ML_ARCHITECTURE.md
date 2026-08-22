# Privacy-Preserving Federated Clinical Research Platform: ML Setup & Architecture in the Federated folder

## 1. System Overview

This platform enables multiple hospitals to collaboratively train a shared machine learning model for clinical research without ever moving or exposing their private patient datasets. The system leverages **Federated Learning (FL)** to move the computation to the data, and **Differential Privacy (DP)** to mathematically guarantee that individual patient records cannot be reverse-engineered from the model's learnings.

---

## 2. The Technology Stack

| Component                   | Technology      | Purpose                                                                                                      |
| --------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------ |
| **Deep Learning Framework** | `PyTorch`       | Defines the clinical neural network, handles forward/backward passes, and computes model weights.            |
| **Federated Orchestration** | `Flower (flwr)` | Coordinates the distributed network, manages training rounds, and handles client-server communication.       |
| **Aggregation Strategy**    | `FedAvg`        | The mathematical algorithm used by the server to combine individual hospital models into one Global Model.   |
| **Differential Privacy**    | `Opacus`        | Wraps the PyTorch optimizer to apply per-sample gradient clipping and noise injection during local training. |

---

## 3. The End-to-End ML Execution Flow

The following sequence dictates exactly how a single data point influences the global network safely during one training round.

1. **Global Model Broadcast:** Server Initialization.
   The Flower Server initializes a generic PyTorch model (Global Model V0) and broadcasts its exact parameters to all participating and connected Hospital Clients.

2. **Local Model Sync:** PyTorch.
   Hospital A receives the global parameters and loads them into its local PyTorch model, ensuring all hospitals start the round from the exact same mathematical baseline.

3. **DP-SGD Training:** Opacus Intervention.
   The hospital begins training on its private dataset. Instead of standard Stochastic Gradient Descent (SGD), Opacus intercepts the process to apply **Differentially Private SGD**:

- Computes the gradient for _each individual patient_ separately.
- Clips the gradient if a patient's data pulls the model too strongly (`max_grad_norm`).
- Injects calibrated statistical noise (`noise_multiplier`) to mask the individual's presence.

4. **Weight Extraction:** Flower Client.
   Once local training epochs are complete, the Flower Client extracts the newly updated, privacy-protected weights from the PyTorch model and serializes them into NumPy arrays for network transit.

5. **Secure Aggregation (FedAvg):** Flower Server.
   The Flower Server receives the encrypted NumPy arrays from Hospital A, Hospital B, and Hospital C. Using `FedAvg`, it calculates a weighted average of all updates (giving slightly more weight to hospitals with larger datasets).

6. **Model Finalization:** Global Model V1.
   The Server applies the aggregated weights to form Global Model V1. The round is logged, metrics (like Global Loss and Privacy Budget $\epsilon$) are recorded, and V1 is broadcast back to the hospitals to begin Round 2.

---

## 4. Component Code Map

If you are setting up the repository, the logic should be separated into two core Python files.

### A. The Orchestrator (`server.py`)

This script lives on the central cloud server. It is completely blind to patient data.

- **Role:** Define the `FedAvg` strategy, specify the number of minimum clients required to start a round, and execute the total number of federated rounds.
- **Key Trigger:** `fl.server.start_server(strategy=FedAvg(...))`

### B. The Hospital Node (`hospital_client.py`)

This script lives securely inside the hospital's internal firewall.

- **Role:** Load the private CSV/SQL database into a PyTorch `DataLoader`, define the `ClinicalModel(nn.Module)`, and execute the `fl.client.NumPyClient` class.
- **Privacy Engine:** This file must include the Opacus wrapper: `privacy_engine.make_private(module, optimizer, data_loader)`.
- **Key Trigger:** `fl.client.start_client(server_address="SERVER_IP")`

---

## 5. Privacy & Security Guarantees

The architecture provides two distinct layers of protection:

1. **Patient-Level Privacy (Opacus / DP):** Protects the human. By adding noise to the gradients _before_ the weights are updated, it becomes mathematically impossible for an attacker with access to the final model to confidently know if "Patient X" was part of the training data.
2. **Institution-Level Privacy (Secure Aggregation):** Protects the hospital. When Secure Aggregation (SecAgg) protocols are overlaid on Flower, the central server never sees Hospital A's specific model update. It only receives the mathematically combined sum of Hospital A + B + C.

---
