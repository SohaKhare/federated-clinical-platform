/**
 * Hand-written mirror of backend/supabase/migrations/*.sql row shapes — the
 * schema source of truth now that Prisma is gone. Used to type-annotate
 * query results from the untyped supabase-js client (see
 * config/supabase.ts for why the client itself isn't generic over this).
 */
export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          user_id: string;
          google_id: string;
          email: string;
          hospital_name: string | null;
          picture: string | null;
          role: string;
          pincode: string | null;
          geolocation: unknown;
          created_at: string;
          updated_at: string;
        };
      };
      patients: {
        Row: {
          patient_id: string;
          hospital_id: string;
          name: string;
          age: number;
          sex: string;
          contributed_to_round: number | null;
          updated_at: string;
          created_at: string;
        };
      };
      patient_events: {
        Row: {
          event_id: string;
          patient_id: string;
          event_type: string;
          event_data: unknown;
          occurred_at: string;
          created_at: string;
        };
      };
      logs: {
        Row: {
          log_id: string;
          node_id: string;
          timestamp: string;
          direction: string;
          round: number;
          metadata: unknown;
          status: string;
          created_at: string;
        };
      };
      federated_rounds: {
        Row: {
          round_id: string;
          round: number;
          status: string;
          target_node_ids: unknown;
          snapshot: unknown;
          created_at: string;
          updated_at: string;
        };
      };
    };
  };
}
