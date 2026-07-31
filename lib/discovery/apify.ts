// Apify integration: map dataset items → RawPosting, and fetch a run's dataset.
// LinkedIn/Indeed scraper field names vary by actor, so we read tolerantly.
import { env } from '../config.js';
import type { RawPosting } from '../types.js';

function pick<T = string>(obj: any, keys: string[]): T | undefined {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== undefined && v !== null && v !== '') return v as T;
  }
  return undefined;
}

export function mapApifyItem(item: any, source: string): RawPosting | null {
  const applyUrl = pick<string>(item, ['jobUrl', 'url', 'link', 'applyUrl', 'jobPostingUrl']);
  const externalId =
    pick<string>(item, ['id', 'jobId', 'jobPostingId', 'trackingId']) ??
    (applyUrl ? applyUrl.split('?')[0] : undefined);
  if (!externalId) return null; // cannot dedup without a stable id

  return {
    source,
    externalId: String(externalId),
    company: pick(item, ['companyName', 'company', 'organizationName', 'employer']),
    roleTitle: pick(item, ['title', 'jobTitle', 'position', 'name']),
    applyUrl,
    location: pick(item, ['location', 'jobLocation', 'formattedLocation', 'place']),
    postedAt: pick(item, ['postedAt', 'publishedAt', 'datePosted', 'listedAt', 'postedTimestamp']),
    jdRaw: pick(item, ['descriptionHtml', 'description', 'jobDescription', 'descriptionText']),
    recruiterName: pick(item, ['recruiterName', 'posterName', 'hiringPerson']),
    recruiterLinkedin: pick(item, ['recruiterProfileUrl', 'posterProfileUrl']),
  };
}

async function apifyGet(path: string): Promise<any> {
  const url = `https://api.apify.com/v2/${path}${path.includes('?') ? '&' : '?'}token=${env.apify.token()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Apify GET ${path} → ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function fetchDatasetItems(datasetId: string): Promise<any[]> {
  return apifyGet(`datasets/${datasetId}/items?clean=true&format=json`) as Promise<any[]>;
}

export async function fetchRunDataset(runId: string): Promise<{ datasetId: string; items: any[] }> {
  const run = await apifyGet(`actor-runs/${runId}`);
  const datasetId: string = run?.data?.defaultDatasetId;
  if (!datasetId) throw new Error(`No defaultDatasetId on Apify run ${runId}`);
  return { datasetId, items: await fetchDatasetItems(datasetId) };
}
