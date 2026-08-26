export interface PrivacyParameters {
  dp_enabled: boolean;
  epsilon: number | null;
  delta: number | null;
  clipping_norm: number | null;
  noise_multiplier: number | null;
  as_of_round: number | null;
}
