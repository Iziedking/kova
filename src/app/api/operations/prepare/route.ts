import { refuseTransactionPreparation } from "../../../../application/capabilities";
export function POST() {
  return Response.json(refuseTransactionPreparation(), {
    status: 503, headers: { "Cache-Control": "no-store" },
  });
}
