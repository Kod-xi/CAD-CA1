import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { GetCommand, TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import { actorKey, ddb, movieKey, type Role, tableName } from "../shared/db";
import { isResponse, parseJsonObject, response } from "../shared/http";
import { logRequest } from "../shared/request-logger";

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {

  logRequest(event);

  const body = parseJsonObject(event);
  if (isResponse(body)) return body;

  if (
    typeof body.movieId !== "number" ||
    !Number.isSafeInteger(body.movieId) ||
    body.movieId <= 0 ||
    typeof body.actorId !== "number" ||
    !Number.isSafeInteger(body.actorId) ||
    body.actorId <= 0
  ) {
    return response(400, {
      message: "movieId and actorId must be positive integers.",
    });
  }
  if (
    typeof body.roleName !== "string" ||
    body.roleName.trim() === "" ||
    typeof body.roleDescription !== "string" ||
    body.roleDescription.trim() === ""
  ) {
    return response(400, {
      message: "roleName and roleDescription must be non-empty strings.",
    });
  }

  const role: Role = {
    movieId: body.movieId,
    actorId: body.actorId,
    roleName: body.roleName,
    roleDescription: body.roleDescription,
  };

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
