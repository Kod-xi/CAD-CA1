import type { APIGatewayProxyEvent } from 'aws-lambda';

// Logs "<cognito username>   <request path>[?query]" to CloudWatch, e.g.
//   doconnor   /actors/4321?movie=1234

const ADMIN = "admin";
const UNKNOWN_USER = "anonymous";

const resolveUser = (event: APIGatewayProxyEvent): string => {
  const context = event.requestContext;
  const username = context.authorizer?.username ?? UNKNOWN_USER;

  if(typeof username !== "string" || username.trim() === ""){
    return UNKNOWN_USER;
  }

  if(context?.identity?.apiKeyId){
    return ADMIN;
  }

  return username;
}

export const logRequest = (event: APIGatewayProxyEvent): void => {
  const username = resolveUser(event);
  const params = Object.entries(event.queryStringParameters ?? {}).filter(
    (entry): entry is [string, string] => entry[1] !== undefined,
  );
  const query = params.length ? `?${new URLSearchParams(params)}` : '';
  console.log(`${username}   ${event.path}${query}`);
};
