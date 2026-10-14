const BUFFER_API = "https://api.buffer.com";

type GraphQLResponse<T> = {
  data?: T;
  errors?: Array<{ message: string }>;
};

async function bufferGraphql<T>(
  apiKey: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(BUFFER_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Buffer API HTTP ${res.status}: ${text}`);
  }

  const json = (await res.json()) as GraphQLResponse<T>;
  if (json.errors?.length) {
    throw new Error(json.errors.map((e) => e.message).join("; "));
  }
  if (!json.data) {
    throw new Error("Buffer API returned empty data");
  }
  return json.data;
}

export type BufferOrganization = { id: string; name: string };
export type BufferChannel = {
  id: string;
  name: string | null;
  displayName: string | null;
  service: string | null;
  avatar: string | null;
  isQueuePaused?: boolean;
};

export async function fetchOrganizations(apiKey: string) {
  const data = await bufferGraphql<{
    account: { organizations: BufferOrganization[] };
  }>(
    apiKey,
    `query {
      account {
        organizations { id name }
      }
    }`,
  );
  return data.account.organizations;
}

export async function fetchChannels(apiKey: string, organizationId: string) {
  const data = await bufferGraphql<{ channels: BufferChannel[] }>(
    apiKey,
    `query GetChannels($organizationId: OrganizationId!) {
      channels(input: { organizationId: $organizationId }) {
        id
        name
        displayName
        service
        avatar
        isQueuePaused
      }
    }`,
    { organizationId },
  );
  return data.channels ?? [];
}

export async function createVideoPost(params: {
  apiKey: string;
  channelId: string;
  text: string;
  videoUrl: string;
  mode: "addToQueue" | "customScheduled";
  dueAt?: string;
  thumbnailOffsetMs?: number;
  /** YouTube requires title (+ category) in post metadata. */
  youtube?: { title: string; categoryId: string };
}) {
  const dueAtLine =
    params.mode === "customScheduled" && params.dueAt
      ? `dueAt: "${params.dueAt}"`
      : "";

  const thumbMeta =
    typeof params.thumbnailOffsetMs === "number"
      ? `metadata: { thumbnailOffset: ${params.thumbnailOffsetMs} }`
      : "";

  const postMetadataLine = params.youtube
    ? `metadata: {
            youtube: {
              title: ${JSON.stringify(params.youtube.title)}
              categoryId: ${JSON.stringify(params.youtube.categoryId)}
            }
          }`
    : "";

  const mutation = `
    mutation CreateVideoPost {
      createPost(
        input: {
          text: ${JSON.stringify(params.text)}
          channelId: "${params.channelId}"
          schedulingType: automatic
          mode: ${params.mode}
          ${dueAtLine}
          ${postMetadataLine}
          assets: [
            {
              video: {
                url: ${JSON.stringify(params.videoUrl)}
                ${thumbMeta}
              }
            }
          ]
        }
      ) {
        ... on PostActionSuccess {
          post {
            id
            text
            dueAt
          }
        }
        ... on MutationError {
          message
        }
      }
    }
  `;

  const data = await bufferGraphql<{
    createPost:
      | { post: { id: string; text: string; dueAt?: string }; message?: never }
      | { message: string; post?: never };
  }>(params.apiKey, mutation);

  const result = data.createPost;
  if ("message" in result && result.message && !result.post) {
    throw new Error(result.message);
  }
  if (!result.post) {
    throw new Error("Buffer createPost failed");
  }
  return result.post;
}

export async function createImagePost(params: {
  apiKey: string;
  channelId: string;
  text: string;
  imageUrls: string[];
  mode: "addToQueue" | "customScheduled";
  dueAt?: string;
}) {
  if (!params.imageUrls.length) {
    throw new Error("At least one image URL is required");
  }
  if (params.imageUrls.length > 10) {
    throw new Error("At most 10 images per carousel post");
  }

  const dueAtLine =
    params.mode === "customScheduled" && params.dueAt
      ? `dueAt: "${params.dueAt}"`
      : "";

  const assets = params.imageUrls
    .map(
      (url) => `{
              image: {
                url: ${JSON.stringify(url)}
              }
            }`,
    )
    .join("\n            ");

  const mutation = `
    mutation CreateImagePost {
      createPost(
        input: {
          text: ${JSON.stringify(params.text)}
          channelId: "${params.channelId}"
          schedulingType: automatic
          mode: ${params.mode}
          ${dueAtLine}
          assets: [
            ${assets}
          ]
        }
      ) {
        ... on PostActionSuccess {
          post {
            id
            text
            dueAt
          }
        }
        ... on MutationError {
          message
        }
      }
    }
  `;

  const data = await bufferGraphql<{
    createPost:
      | { post: { id: string; text: string; dueAt?: string }; message?: never }
      | { message: string; post?: never };
  }>(params.apiKey, mutation);

  const result = data.createPost;
  if ("message" in result && result.message && !result.post) {
    throw new Error(result.message);
  }
  if (!result.post) {
    throw new Error("Buffer createPost failed");
  }
  return result.post;
}

export type BufferPostMetric = {
  type: string;
  name: string;
  value: number;
  unit: string;
};

export async function fetchPostMetrics(apiKey: string, postId: string) {
  const data = await bufferGraphql<{
    post: {
      id: string;
      metrics: BufferPostMetric[];
      metricsUpdatedAt: string | null;
    } | null;
  }>(
    apiKey,
    `query GetPostMetrics($id: PostId!) {
      post(input: { id: $id }) {
        id
        metrics { type name value unit }
        metricsUpdatedAt
      }
    }`,
    { id: postId },
  );
  return data.post;
}
