# API Specification — Source of Truth

> **IMPORTANT FOR AI/CODING AGENTS:** This document defines the intended API surface for the project.
>
> When implementing or reviewing the API:
>
> - Use the endpoints documented below as the baseline.
> - If an endpoint, operation, or API needed for the described functionality is missing, **add it** and update this document accordingly.
> - If an endpoint is redundant, unnecessary, duplicated, conflicts with the architecture, or is not required by the project, **remove it** and update this document accordingly.
> - Do not create endpoints merely for convenience if the functionality can be handled internally or through an existing endpoint.
> - Preserve the separation between the **Local Node** and **Global Node**.
> - The **Local Node** may access patient-level data belonging to its hospital.
> - The **Global Node must never expose or request patient-level APIs/data**.
> - Federated-learning communication must transfer only the information required by the federation protocol; it must never transfer raw patient records to the Global Node.
> - Privacy mechanisms such as Differential Privacy and Secure Aggregation must be reflected accurately in the API design.
> - Before implementing a new endpoint, check whether an existing endpoint already provides the required functionality.
> - If an endpoint's purpose, request/response structure, authorization requirements, or ownership is unclear, inspect the project architecture and existing implementation before introducing a new API.
>
> **Goal:** Keep this file synchronized with the actual implementation. If the implementation changes the API surface, update `api.md` as part of the same change.

# Local Node APIs

Local Node APIs
The Local Node runs inside a participating hospital. It has access to that hospital's patient data, local model, local database, and federated-learning client.
/auth
Handles authentication and identity for users accessing the hospital's local platform.
POST /auth/login
Authenticates a hospital user using their credentials and creates an authenticated session/access token.
POST /auth/logout
Logs out the currently authenticated user and invalidates their session/token.
GET /auth/me
Returns information about the currently logged-in user, including their user ID, role, and associated hospital.
/patients
Handles patient data that is stored only within the hospital's local node.
GET /patients
Returns a paginated/listed view of patients stored in the local hospital database. Supports filtering and searching based on authorized fields.
POST /patients
Creates a new patient record in the hospital's local database. The data remains within the hospital and can subsequently be used for local inference or future local training according to the hospital's policy.
GET /patients/{id}
Returns the detailed profile of a specific patient from the local hospital database.
GET /patients/{id}/events
Returns the chronological clinical history/events associated with a patient, such as admission, treatment, observation, follow-up, and outcome.
POST /patients/{id}/events
Adds a new clinical event to an existing patient's history. This should append a new event rather than overwrite previous clinical information.
/model
Handles the hospital's local PyTorch model.
GET /model
Returns the current local model's status and metadata, such as model version, training status, last training time, and number of local training samples.
POST /model/predict
Runs inference using the hospital's local model. The submitted clinical information is processed locally and is not sent to the global node.
GET /model/metrics
Returns the evaluation metrics of the current local model, such as F1-score, AUROC, precision, recall, loss, and calibration metrics where applicable.
/federated
Handles the hospital's participation in federated-learning rounds.
GET /federated/status
Returns the current federated-learning status of the hospital, such as idle, waiting, training, submitting update, or completed.
GET /federated/round
Returns information about the current federated-learning round, including the round number, global model version, participation status, and round state.
GET /federated/history
Returns the hospital's previous federated-learning participation, including completed rounds, participation status, and relevant performance metrics.
POST /federated/participate
Registers/confirms the hospital's participation in a federated-learning round and triggers the local training workflow when the round begins.
The hospital trains locally and sends only the required protected model update—not patient records—to the federated system.
/privacy
Provides information about the privacy mechanisms being applied to the local training process.
GET /privacy/status
Returns whether privacy mechanisms such as Differential Privacy and Secure Aggregation are currently enabled and active for the hospital.
GET /privacy/parameters
Returns the configured privacy parameters, such as epsilon, delta, clipping norm, noise multiplier, and other relevant DP configuration.
/research
Provides research-oriented insights generated from local and appropriately aggregated clinical data.
GET /research/summary
Returns a high-level summary of local clinical trends, treatment patterns, outcome statistics, and relevant model findings.
GET /research/insights
Returns statistically identified patterns or associations discovered from the hospital's local clinical data/model.
These should be presented as observed associations, not automatic causal conclusions.
/heatmap
Provides aggregated geographic information for visualization.
GET /heatmap
Returns aggregated geographic health indicators that can be visualized on a map.
GET /heatmap/regions
Returns aggregated health statistics for individual geographic regions such as districts or states.
Patient-level information should be aggregated before being used for the heatmap, with appropriate privacy/minimum-group-size protections.
/logs
Handles operational and federated activity logs for the local node.
GET /logs
Returns filtered logs for activities such as authentication, patient operations, local training, model synchronization, federated participation, and system events.
/audit
GET /audit
Returns the security/compliance audit trail for sensitive actions performed on the local node.
Examples include:
Patient record accessed
Patient event added
Model update generated
User authentication
Federated round joined
Global model received
Audit records should be append-only and should not contain unnecessary patient information.

# Global Node APIs

Global Node APIs
The Global Node is the federation coordinator. It manages participating hospital nodes, federated rounds, global model versions, aggregation status, and aggregate research/public-health information.
The Global Node does not have patient APIs.
It should never provide endpoints such as:
/global/patients
/global/patients/{id}
because patient records remain inside individual hospitals.
/auth
Handles authentication for administrators/researchers/users accessing the global platform.
POST /auth/login
Authenticates a global-platform user and creates an authenticated session/access token.
POST /auth/logout
Logs out the current user and invalidates their session/token.
GET /auth/me
Returns the currently authenticated user's identity, role, and permissions.
/nodes
Manages and monitors hospitals participating in the federated network.
GET /nodes
Returns a list of registered hospital nodes and their basic federation metadata, such as node ID, name, connection status, and participation status.
GET /nodes/{id}
Returns detailed information about a specific hospital node, including its registration information and federated participation history.
GET /nodes/{id}/status
Returns the current operational and federated status of a specific hospital, such as online, offline, training, waiting, or synchronized.
GET /nodes/{id}/metrics
Returns aggregate/non-sensitive metrics associated with a hospital node, such as training performance, participation rate, number of completed rounds, and communication statistics.
It should not return the hospital's patient data or raw model update.
/federated
Controls and monitors the global federated-learning process.
GET /federated/status
Returns the current state of the federated system, including active round, participating nodes, aggregation status, and global model version.
GET /federated/rounds
Returns the history/list of federated-learning rounds, including their status, participating hospitals, and global model performance.
GET /federated/rounds/{id}
Returns detailed information about a specific federated round, including participating nodes, successful/failed clients, aggregation status, resulting model version, and evaluation metrics.
POST /federated/rounds/start
Starts a new federated-learning round. The global coordinator selects/contacts eligible hospital nodes and initiates the model-training process.
POST /federated/pull
Triggers or requests synchronization with participating hospital nodes to obtain the latest federated model updates/status, depending on the federation protocol.
This endpoint must never mean "pull patient data from hospitals."
/models
Manages global model versions produced through federated training.
GET /models
Returns a list of global model versions generated across federated rounds.
GET /models/latest
Returns metadata about the currently active/latest global model, including its version, associated federated round, creation time, and overall metrics.
GET /models/{id}
Returns detailed metadata about a specific global model version.
GET /models/{id}/metrics
Returns the evaluation metrics for a specific global model, such as AUROC, F1, precision, recall, loss, and calibration.
GET /models/{id}/history
Returns the development/history of a model version, including the federated rounds and model versions that contributed to its evolution.
/privacy
Provides transparency about the privacy mechanisms used by the federation.
GET /privacy/status
Returns the current status of privacy mechanisms across the federated system, such as whether Differential Privacy and Secure Aggregation are enabled.
GET /privacy/parameters
Returns the privacy configuration used for the federated process, including parameters such as epsilon, delta, noise multiplier, clipping norm, and number of rounds.
The global node should expose privacy metadata, not individual hospital updates.
/logs
Handles global federation activity logs.
GET /logs
Returns global system/federation logs such as:
Hospital connected
Federated round started
Hospital update received
Aggregation completed
Global model generated
Hospital synchronized
Node disconnected
Supports filtering by event type, node, date, round, or status.
GET /logs/{node_id}
Returns federation-related logs specifically associated with a particular hospital node.
These logs should describe the event and status without exposing the hospital's raw model update or patient data.
/research
Provides aggregate research insights derived from the federated system.
GET /research/summary
Returns a high-level summary of global clinical research findings, model performance, observed treatment/outcome patterns, and cross-hospital trends.
Only approved aggregate information should be exposed.
GET /research/insights
Returns research-oriented patterns identified by the global model or federated analytics.
For example:
Observed association between:
Patient characteristics

- Treatment strategy
- Outcome
  The system should clearly label these as associations/patterns, not causal conclusions.
  /heatmap
  Provides regional aggregate health information for visualization.
  GET /heatmap
  Returns aggregated geographic indicators used to generate the global/regional health heatmap.
  GET /heatmap/regions
  Returns aggregated health indicators for specific states, districts, or other supported geographic regions.
  The global node should receive only authorized aggregate information, not individual patient locations or records.
  /public-health
  Handles the secondary public-health intelligence layer.
  GET /public-health/summary
  Returns a high-level summary of regional public-health indicators, trends, and identified priority areas.
  GET /public-health/regions
  Returns public-health information for different geographic regions, such as states or districts.
  GET /public-health/signals
  Returns the aggregate health, nutrition, and community-level signals used by the regional analysis system.
  For example:
  Clinical signal
  Nutrition signal
  Community signal
  Health-service signal
  These signals can then feed the regional priority system.
  /pds
  Handles decision support related to nutritional/public-health intervention through PDS.
  GET /pds/recommendations
  Returns the current regional PDS decision-support recommendations generated from the approved aggregate public-health signals.
  GET /pds/recommendations/{region_id}
  Returns the recommendation and supporting indicators for a specific region.
  For example:
  Region: District X

Health signal: High
Nutrition signal: High
Community signal: Medium

Priority: High

Reason:
Multiple aggregate indicators
suggest increased nutritional
attention may be warranted.
This is decision support, not an automatic allocation mechanism. The final decision remains with the appropriate authority.
