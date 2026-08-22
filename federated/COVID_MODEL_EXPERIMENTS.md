# FEDNET COVID-19 Model Optimization & Discrimination Audit (COVID_MODEL_EXPERIMENTS.md)

## 1. Overview

This document records the controlled hyperparameter experiments performed strictly on the **training/validation partition** ($N_{\text{train}}=749$, $N_{\text{val}}=188$) to improve model discrimination without test set leakage.

## 2. Best Configuration Selected on Validation Split

- **Experiment ID:** `combo_32_16_lr001_ep10_rd10`

- **Architecture:** `Linear(35, 32) -> ReLU -> Linear(32, 16) -> ReLU -> Linear(16, 1)`

- **Learning Rate:** `0.01`

- **Local Epochs per Round:** `10`

- **Federated Rounds:** `10`

- **Class Weighting Strategy:** `train_global`

- **Validation PR-AUC:** `0.1206`

- **Validation ROC-AUC:** `0.5688`

- **Validation F1:** `0.2098`

- **Validation Recall:** `0.8333`

- **Training-Locked Threshold:** `0.007348`


## 3. Validation Experiments Comparison Table

| Experiment ID | Category | Arch | LR | Epochs | Rounds | Val PR-AUC | Val ROC-AUC | Val F1 (Cal) | Val Recall (Cal) |
|---|---|---|---|---|---|---|---|---|---|
| `combo_32_16_lr001_ep10_rd10` | combined_grid | [32, 16] | 0.01 | 10 | 10 | **0.1206** | 0.5688 | 0.2098 | 0.8333 |
| `rounds_10` | federated_rounds | [16, 8] | 0.01 | 10 | 10 | **0.1143** | 0.5809 | 0.2370 | 0.8889 |
| `epochs_20` | local_epochs | [16, 8] | 0.01 | 20 | 5 | **0.1075** | 0.5580 | 0.2237 | 0.9444 |
| `combo_64_32_lr0005_ep10_rd10` | combined_grid | [64, 32] | 0.005 | 10 | 10 | **0.1071** | 0.5502 | 0.2222 | 0.7778 |
| `arch_32_16_medium` | architecture | [32, 16] | 0.01 | 10 | 5 | **0.1048** | 0.5208 | 0.2027 | 0.8333 |
| `combo_16_8_lr0005_ep10_rd10` | combined_grid | [16, 8] | 0.005 | 10 | 10 | **0.1022** | 0.5443 | 0.2302 | 0.8889 |
| `weight_mode_local_client` | class_weighting | [16, 8] | 0.01 | 10 | 5 | **0.1008** | 0.5325 | 0.2222 | 0.8333 |
| `weight_mode_train_global` | class_weighting | [16, 8] | 0.01 | 10 | 5 | **0.1008** | 0.5325 | 0.2222 | 0.8333 |
| `arch_16_8_current` | architecture | [16, 8] | 0.01 | 10 | 5 | **0.1008** | 0.5325 | 0.2222 | 0.8333 |
| `lr_0.01` | learning_rate | [16, 8] | 0.01 | 10 | 5 | **0.1008** | 0.5325 | 0.2222 | 0.8333 |
| `epochs_10` | local_epochs | [16, 8] | 0.01 | 10 | 5 | **0.1008** | 0.5325 | 0.2222 | 0.8333 |
| `rounds_5` | federated_rounds | [16, 8] | 0.01 | 10 | 5 | **0.1008** | 0.5325 | 0.2222 | 0.8333 |
| `lr_0.001` | learning_rate | [16, 8] | 0.001 | 10 | 5 | **0.0973** | 0.5191 | 0.2192 | 0.8889 |
| `combo_32_16_lr0005_ep10_rd10` | combined_grid | [32, 16] | 0.005 | 10 | 10 | **0.0960** | 0.4982 | 0.2051 | 0.8889 |
| `lr_0.005` | learning_rate | [16, 8] | 0.005 | 10 | 5 | **0.0938** | 0.5067 | 0.2179 | 0.9444 |
| `epochs_5` | local_epochs | [16, 8] | 0.01 | 5 | 5 | **0.0938** | 0.5096 | 0.2267 | 0.9444 |
| `arch_64_32_large` | architecture | [64, 32] | 0.01 | 10 | 5 | **0.0929** | 0.4917 | 0.2038 | 0.8889 |
| `lr_0.003` | learning_rate | [16, 8] | 0.003 | 10 | 5 | **0.0914** | 0.4943 | 0.2086 | 0.9444 |
| `combo_32_16_lr0005_ep10_rd5` | combined_grid | [32, 16] | 0.005 | 10 | 5 | **0.0853** | 0.4485 | 0.1977 | 0.9444 |

## 4. Final Benchmark Evaluation on Untouched Test Set ($N=235$)

Evaluated exactly once after locking the best configuration and training-calibrated threshold:


| Metric | Centralized Baseline | Federated FedAvg | DP-FedAvg (Standard $\tau=0.50$) | DP-FedAvg (Locked $\tau^*$) |
|---|---|---|---|---|
| **Accuracy** | 0.6255 | 0.7319 | 0.9064 | **0.3362** |
| **Precision** | 0.1700 | 0.1273 | 0.0000 | **0.1193** |
| **Recall (Sensitivity)** | **0.7727** (17/22) | **0.3182** (7/22) | **0.0000** (0/22) | **0.9545** (21/22) |
| **Specificity** | 0.6103 | 0.7746 | 1.0000 | **0.2723** |
| **F1 Score** | 0.2787 | 0.1818 | 0.0000 | **0.2121** |
| **Balanced Accuracy** | 0.6915 | 0.5464 | 0.5000 | **0.6134** |
| **ROC-AUC** | **0.6516** | **0.6614** | **0.6787** | **0.6787** |
| **PR-AUC** | **0.1530** | **0.2201** | **0.1632** | **0.1632** |
| **Confusion Matrix** | `[130, 83, 5, 17]` | `[165, 48, 15, 7]` | `[213, 0, 22, 0]` | `[58, 155, 1, 21]` |
| **Privacy Bound** | $\epsilon = \infty$ | Non-Private | $\epsilon = 42.9001, \delta = 10^{-5}$ | $\epsilon = 42.9001, \delta = 10^{-5}$ |