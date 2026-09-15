import { getCapabilities } from "../../../application/capabilities";
export function GET() {
  return Response.json(getCapabilities(), { headers: { "Cache-Control": "no-store" } });
}
