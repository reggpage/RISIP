import { supabase } from '@/lib/supabase';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

// Downloads the project's Excel export. We can't use supabase.functions.invoke here
// because it JSON-parses the response — we need the raw binary blob. So we fetch the
// function endpoint directly with the caller's access token and trigger a download.
export async function exportProjectExcel(projectId: string, projectName: string): Promise<void> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error('Not signed in');

  const res = await fetch(`${SUPABASE_URL}/functions/v1/export-project-excel`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      apikey: ANON_KEY,
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ project_id: projectId }),
  });

  if (!res.ok) {
    let message = `Export failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      // non-JSON error body — keep the generic message
    }
    throw new Error(message);
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const safe = projectName.replace(/[^a-z0-9]+/gi, '_').slice(0, 40) || 'project';
  a.download = `${safe}_receipts.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
