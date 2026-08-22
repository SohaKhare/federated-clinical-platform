/**
 * System-managed event types that carry a full ClinicalSnapshot as their
 * event_data. Reserved: a client can never create one of these directly
 * through POST /patients/:id/events, since a hand-crafted payload of the
 * wrong shape would corrupt "current clinical state" lookups.
 */
export const CLINICAL_SNAPSHOT_EVENT_TYPES = [
    "patient_created",
    "patient_updated",
];
//# sourceMappingURL=patient-event.interface.js.map