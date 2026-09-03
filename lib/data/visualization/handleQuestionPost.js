import { executeQuestion } from "./executeQuestion";

export async function handleQuestionPost(request, adapter) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      {
        status: "blocked",
        observations: [],
        comparisons: [],
        periods: [],
        issues: [{
          code: "malformedJson",
          level: "blocking",
          comparisonId: null,
          message: "Send valid JSON.",
        }],
      },
      { status: 400 },
    );
  }
  try {
    const result = await executeQuestion(body, { adapter });
    return Response.json(result, { status: result.status === "blocked" ? 400 : 200 });
  } catch (error) {
    return Response.json(
      {
        status: "blocked",
        observations: [],
        comparisons: [],
        periods: [],
        issues: [{
          code: "serverError",
          level: "blocking",
          comparisonId: null,
          message: error.message,
        }],
      },
      { status: 500 },
    );
  }
}
