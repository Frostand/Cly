import type {
  Folder,
  FolderWithPapers,
  ProviderHealth,
  ProviderHealthMap,
  ProviderInfo,
  PaperSource,
  ResearchRun,
  RunSnapshot,
} from "./types";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8001";
const API_V1_BASE_URL = `${API_BASE_URL}/api/v1`;

export async function fetchProvidersWithHealth(): Promise<{
  providers: ProviderInfo[];
  providerHealth: ProviderHealthMap;
}> {
  const providerResponse = await fetch(`${API_V1_BASE_URL}/ai/providers`);
  if (!providerResponse.ok) {
    throw new Error("Provider list request failed");
  }

  const providers = (await providerResponse.json()) as ProviderInfo[];
  const healthEntries = await Promise.all(
    providers.map(async (provider) => {
      const health = await fetchProviderHealth(provider.name);
      return [provider.name, health] as const;
    }),
  );

  return {
    providers,
    providerHealth: Object.fromEntries(healthEntries),
  };
}

export async function createResearchRun(topic: string): Promise<ResearchRun> {
  const runResponse = await fetch(`${API_V1_BASE_URL}/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topic }),
  });
  if (!runResponse.ok) {
    throw new Error("Run creation failed");
  }

  return (await runResponse.json()) as ResearchRun;
}

export async function startResearchRun({
  runId,
  maxResults,
  providerName,
  paperSource,
}: {
  runId: string;
  maxResults: number;
  providerName: string;
  paperSource: PaperSource;
}): Promise<void> {
  const startResponse = await fetch(`${API_V1_BASE_URL}/runs/${runId}/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      max_results: maxResults,
      provider_name: providerName,
      paper_source: paperSource,
    }),
  });
  if (!startResponse.ok) {
    throw new Error(await apiErrorMessage(startResponse, "Run start failed"));
  }
}

export async function fetchRunSnapshot(runId: string): Promise<RunSnapshot> {
  const [runResponse, papersResponse, extractionsResponse, landscapeResponse] =
    await Promise.all([
      fetch(`${API_V1_BASE_URL}/runs/${runId}`),
      fetch(`${API_V1_BASE_URL}/runs/${runId}/papers`),
      fetch(`${API_V1_BASE_URL}/runs/${runId}/extractions`),
      fetch(`${API_V1_BASE_URL}/runs/${runId}/landscape`),
    ]);
  if (
    !runResponse.ok ||
    !papersResponse.ok ||
    !extractionsResponse.ok ||
    !landscapeResponse.ok
  ) {
    throw new Error("Run polling failed");
  }

  const run = (await runResponse.json()) as ResearchRun;
  const papersData = (await papersResponse.json()) as RunPapersResponse;
  const extractionsData =
    (await extractionsResponse.json()) as RunExtractionsResponse;
  const landscapeData = (await landscapeResponse.json()) as RunLandscapeResponse;

  return {
    run,
    papers: papersData.papers,
    extractions: extractionsData.extractions,
    landscape: landscapeData.landscape,
  };
}

export async function fetchFolders(): Promise<Folder[]> {
  const response = await fetch(`${API_V1_BASE_URL}/folders`);
  if (!response.ok) {
    throw new Error("Folder list request failed");
  }

  return (await response.json()) as Folder[];
}

export async function fetchFolder(folderId: string): Promise<FolderWithPapers> {
  const response = await fetch(`${API_V1_BASE_URL}/folders/${folderId}`);
  if (!response.ok) {
    throw new Error(await apiErrorMessage(response, "Folder request failed"));
  }

  return (await response.json()) as FolderWithPapers;
}

export async function createFolder(name: string): Promise<Folder> {
  const response = await fetch(`${API_V1_BASE_URL}/folders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!response.ok) {
    throw new Error(await apiErrorMessage(response, "Folder creation failed"));
  }

  return (await response.json()) as Folder;
}

export async function renameFolder({
  folderId,
  name,
}: {
  folderId: string;
  name: string;
}): Promise<Folder> {
  const response = await fetch(`${API_V1_BASE_URL}/folders/${folderId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!response.ok) {
    throw new Error(await apiErrorMessage(response, "Folder rename failed"));
  }

  return (await response.json()) as Folder;
}

export async function deleteFolder(folderId: string): Promise<void> {
  const response = await fetch(`${API_V1_BASE_URL}/folders/${folderId}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error(await apiErrorMessage(response, "Folder deletion failed"));
  }
}

export async function addPaperToFolder({
  folderId,
  paperId,
}: {
  folderId: string;
  paperId: string;
}): Promise<FolderWithPapers> {
  const response = await fetch(`${API_V1_BASE_URL}/folders/${folderId}/papers`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paper_id: paperId }),
  });
  if (!response.ok) {
    throw new Error(await apiErrorMessage(response, "Could not save paper"));
  }

  return (await response.json()) as FolderWithPapers;
}

export async function removePaperFromFolder({
  folderId,
  paperId,
}: {
  folderId: string;
  paperId: string;
}): Promise<FolderWithPapers> {
  const response = await fetch(
    `${API_V1_BASE_URL}/folders/${folderId}/papers/${encodeURIComponent(paperId)}`,
    { method: "DELETE" },
  );
  if (!response.ok) {
    throw new Error(await apiErrorMessage(response, "Could not remove paper"));
  }

  return (await response.json()) as FolderWithPapers;
}

async function fetchProviderHealth(
  providerName: string,
): Promise<ProviderHealth> {
  const healthResponse = await fetch(
    `${API_V1_BASE_URL}/ai/providers/${providerName}/health`,
  );

  return (await healthResponse.json()) as ProviderHealth;
}

async function apiErrorMessage(response: Response, fallbackMessage: string) {
  try {
    const payload = await response.json();
    if (
      payload &&
      typeof payload === "object" &&
      "detail" in payload &&
      typeof payload.detail === "string"
    ) {
      return payload.detail;
    }
    if (
      payload &&
      typeof payload === "object" &&
      "detail" in payload &&
      payload.detail &&
      typeof payload.detail === "object" &&
      "message" in payload.detail &&
      typeof payload.detail.message === "string"
    ) {
      return payload.detail.message;
    }
  } catch {
    return fallbackMessage;
  }

  return fallbackMessage;
}

type RunPapersResponse = {
  run_id: string;
  papers: RunSnapshot["papers"];
};

type RunExtractionsResponse = {
  run_id: string;
  extractions: RunSnapshot["extractions"];
};

type RunLandscapeResponse = {
  run_id: string;
  landscape: RunSnapshot["landscape"];
};
