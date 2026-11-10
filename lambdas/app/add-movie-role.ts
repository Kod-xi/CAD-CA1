import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { GetCommand, TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import { actorKey, ddb, movieKey, type Role, tableName } from "../shared/db";
import { isResponse, parseJsonObject, response } from "../shared/http";
import { logRequest } from "../shared/request-logger";
import Ajv from "ajv";
import schema from "../shared/schema.json";

const ajv = new Ajv();
const isValidRolePayload = ajv.compile<Role>(
  schema.definitions["Role"] || {}
);

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {

  logRequest(event);

  const body = parseJsonObject(event);
  if (isResponse(body)) return body;

  if(!isValidRolePayload(body)) {
    return response(400, {
      message: "Invalid body in request",
      errors: isValidRolePayload.errors,
    });
  }

  const role: Role = body

  try {
    const [movieResult, actorResult] = await Promise.all([
      ddb.send(
        new GetCommand({
          TableName: tableName,
          Key: {
            PK: movieKey(role.movieId),
            SK: movieKey(role.movieId),
          },
        })
      ),
      ddb.send(
        new GetCommand({
          TableName: tableName,
          Key: {
            PK: actorKey(role.actorId),
            SK: actorKey(role.actorId),
          },
        })
      ),
    ]);

    if (!movieResult.Item) {
      return response(404, { message: `Movie ${role.movieId} not found` });
    }
    if (!actorResult.Item) {
      return response(404, { message: `Actor ${role.actorId} not found` });
    }

    await ddb.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            ConditionCheck: {
              TableName: tableName,
              Key: {
                PK: movieKey(role.movieId),
                SK: movieKey(role.movieId),
              },
              ConditionExpression: "attribute_exists(PK)",
            },
          },
          {
            ConditionCheck: {
              TableName: tableName,
              Key: {
                PK: actorKey(role.actorId),
                SK: actorKey(role.actorId),
              },
              ConditionExpression: "attribute_exists(PK)",
            },
          },
          {
            Put: {
              TableName: tableName,
              Item: {
                PK: movieKey(role.movieId),
                SK: actorKey(role.actorId),
                ...role,
              },
            },
          },
        ],
      })
    );

    return response(201, { message: "Role added", data: role });
  } catch (err) {
    console.error("DynamoDB error:", err);
    return response(500, { message: "Internal server error" });
  }
};
