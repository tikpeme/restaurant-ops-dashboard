import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "crypto";
import {
  EventBridgeClient,
  PutEventsCommand,
} from "@aws-sdk/client-eventbridge";

// Clients are created once, outside the handler, so warm invocations reuse them
const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE_NAME = process.env.TABLE_NAME!;
const eventBridgeClient = new EventBridgeClient({});
const EVENT_BUS_NAME = process.env.EVENT_BUS_NAME!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
};

const json = (statusCode: number, body: unknown): APIGatewayProxyResult => ({
  statusCode,
  headers: corsHeaders,
  body: JSON.stringify(body),
});

// Who is calling? Read from the token API Gateway already verified against
// Cognito. Never trust the request body or URL for identity.
const getCaller = (event: APIGatewayProxyEvent) => {
  const claims = event.requestContext.authorizer?.claims ?? {};
  // API Gateway flattens the groups array into a string such as "[Owners]",
  // so split it back apart leniently
  const groups = String(claims["cognito:groups"] ?? "")
    .split(/[\s,\[\]]+/)
    .filter(Boolean);
  return {
    isOwner: groups.includes("Owners"),
    isManager: groups.includes("Managers"),
    isInvestor: groups.includes("Investors"),
    locationId: claims["custom:locationId"] as string | undefined,
  };
};

const isMoney = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) && v >= 0;

// Server-side validation. The browser's checks can be bypassed by calling the API directly.
const validateReport = (body: any, reportDate: string): string | null => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reportDate))
    return "reportDate must be YYYY-MM-DD";
  if (!isMoney(body.revenue)) return "revenue must be a non-negative number";
  if (!isMoney(body.revenueTarget) || body.revenueTarget <= 0)
    return "revenueTarget must be greater than 0";
  if (!Number.isInteger(body.coversServed) || body.coversServed <= 0)
    return "coversServed must be a whole number above 0";
  if (!isMoney(body.voids)) return "voids must be a non-negative number";
  if (!isMoney(body.comps)) return "comps must be a non-negative number";
  if (
    body.incidentNotes !== undefined &&
    (typeof body.incidentNotes !== "string" || body.incidentNotes.length > 500)
  )
    return "incidentNotes must be text under 500 characters";
  return null;
};

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  const method = event.httpMethod;
  const pathLocationId = event.pathParameters?.locationId;
  const pathReportDate = event.pathParameters?.reportDate;
  const caller = getCaller(event);

  try {
    // POST /reports: owner for any location, manager for their own only
    if (method === "POST") {
      if (!caller.isOwner && !caller.isManager)
        return json(403, { message: "Not authorized" });

      const body = JSON.parse(event.body || "{}");
      // A manager's location comes from the token and the body is ignored
      const reportLocation = caller.isOwner
        ? body.locationId
        : caller.locationId;
      if (!reportLocation)
        return caller.isOwner
          ? json(400, { message: "locationId is required" })
          : json(403, { message: "No location assigned to this user" });

      const invalid = validateReport(body, body.reportDate);
      if (invalid) return json(400, { message: invalid });

      const reportId = randomUUID();
      // Lambda enforces the 24-hour edit window by checking this on every PUT
      const editableUntil = Math.floor(Date.now() / 1000) + 60 * 60 * 24;

      try {
        await docClient.send(
          new PutCommand({
            TableName: TABLE_NAME,
            Item: {
              locationId: reportLocation,
              reportDate: body.reportDate,
              reportId,
              submittedAt: new Date().toISOString(),
              submittedBy: event.requestContext.authorizer?.claims?.sub,
              editableUntil,
              isArchived: false,
              avgSpendPerCover: body.revenue / body.coversServed,
              revenue: body.revenue,
              revenueTarget: body.revenueTarget,
              coversServed: body.coversServed,
              voids: body.voids,
              comps: body.comps,
              incidentNotes: body.incidentNotes ?? "",
            },
            // Without this, a second POST for the same location and date would
            // silently overwrite the report and bypass the 24-hour edit window
            ConditionExpression: "attribute_not_exists(locationId)",
          }),
        );
      } catch (error) {
        if ((error as Error).name === "ConditionalCheckFailedException")
          return json(409, {
            message:
              "A report already exists for this location and date. Edit it instead.",
          });
        throw error;
      }

      // The alert is best-effort: a failed alert must not fail an already-saved report
      if (body.revenue < body.revenueTarget) {
        try {
          await eventBridgeClient.send(
            new PutEventsCommand({
              Entries: [
                {
                  Source: "restaurant.ops",
                  DetailType: "LowRevenueAlert",
                  Detail: JSON.stringify({
                    locationId: reportLocation,
                    reportDate: body.reportDate,
                    revenue: body.revenue,
                    revenueTarget: body.revenueTarget,
                    shortfall: body.revenueTarget - body.revenue,
                  }),
                  EventBusName: EVENT_BUS_NAME,
                },
              ],
            }),
          );
        } catch (alertError) {
          console.error("Alert publish failed", alertError);
        }
      }

      return json(201, { message: "Report created successfully", reportId });
    }

    // GET /reports: all locations for a date (owner and investor)
    if (method === "GET" && !pathLocationId) {
      if (!caller.isOwner && !caller.isInvestor)
        return json(403, { message: "Not authorized" });

      const date =
        event.queryStringParameters?.date ||
        new Date().toISOString().split("T")[0];

      const result = await docClient.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          IndexName: "reportDate-locationId-index",
          KeyConditionExpression: "reportDate = :date",
          ExpressionAttributeValues: { ":date": date },
        }),
      );
      return json(200, { reports: result.Items });
    }

    // GET /reports/{locationId}: owner and investor can read any, a manager only their own
    if (method === "GET" && pathLocationId && !pathReportDate) {
      const allowed =
        caller.isOwner ||
        caller.isInvestor ||
        (caller.isManager && caller.locationId === pathLocationId);
      if (!allowed)
        return json(403, { message: "Not authorized for this location" });

      const result = await docClient.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          KeyConditionExpression: "locationId = :locationId",
          ExpressionAttributeValues: { ":locationId": pathLocationId },
          ScanIndexForward: false, // newest first
        }),
      );
      return json(200, { reports: result.Items });
    }

    // PUT /reports/{locationId}/{reportDate}: owner any, manager their own, within 24 hours
    if (method === "PUT" && pathLocationId && pathReportDate) {
      const allowed =
        caller.isOwner ||
        (caller.isManager && caller.locationId === pathLocationId);
      if (!allowed)
        return json(403, { message: "Not authorized for this location" });

      const body = JSON.parse(event.body || "{}");
      const invalid = validateReport(body, pathReportDate);
      if (invalid) return json(400, { message: invalid });

      const existing = await docClient.send(
        new GetCommand({
          TableName: TABLE_NAME,
          Key: { locationId: pathLocationId, reportDate: pathReportDate },
        }),
      );
      if (!existing.Item) return json(404, { message: "Report not found" });

      if (existing.Item.editableUntil < Math.floor(Date.now() / 1000))
        return json(403, { message: "Edit window has closed" });

      await docClient.send(
        new UpdateCommand({
          TableName: TABLE_NAME,
          Key: { locationId: pathLocationId, reportDate: pathReportDate },
          UpdateExpression:
            "SET revenue = :revenue, revenueTarget = :revenueTarget, coversServed = :coversServed, voids = :voids, comps = :comps, incidentNotes = :incidentNotes, avgSpendPerCover = :avgSpendPerCover",
          ExpressionAttributeValues: {
            ":revenue": body.revenue,
            ":revenueTarget": body.revenueTarget,
            ":coversServed": body.coversServed,
            ":voids": body.voids,
            ":comps": body.comps,
            ":incidentNotes": body.incidentNotes ?? "",
            ":avgSpendPerCover": body.revenue / body.coversServed,
          },
        }),
      );
      return json(200, { message: "Report updated successfully" });
    }

    return json(405, { message: "Method not allowed" });
  } catch (error) {
    console.error("Unhandled error", error);
    return json(500, { message: "Internal server error" });
  }
};
