import { getCapabilities, refuseTransactionPreparation } from "../src/application/capabilities";
console.log(JSON.stringify({
  capabilities: getCapabilities(),
  attemptedPreparation: refuseTransactionPreparation(),
  proves: "The scaffold refuses unavailable financial actions.",
  doesNotProve: "LP safety, campaign settlement, paid data delivery, or mainnet execution.",
}, null, 2));
