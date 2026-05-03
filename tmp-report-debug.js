const fetch = globalThis.fetch;

(async () => {
  try {
    const base = 'http://127.0.0.1:4000';

    const loginRes = await fetch(`${base}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@example.com' }),
    });

    console.log('LOGIN_STATUS', loginRes.status);
    const loginText = await loginRes.text();
    console.log('LOGIN_BODY', loginText);
    const loginJson = JSON.parse(loginText);
    const token = loginJson.data?.token;

    if (!token) {
      console.error('No token returned');
      return;
    }

    const reportRes = await fetch(`${base}/api/v1/reports/daily-call-plan/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        reportDate: '2026-05-04',
        flexUploadBatchId: 'c15bcefe-9337-4420-96ed-afd3b2929625',
        renderwaysUploadBatchId: 'c5660275-2f08-4b19-9946-4b3e6bb8edf8',
        callPlanUploadBatchId: '5a1cd4ad-4e8a-4964-b4dd-4a527fdd6f17',
      }),
    });

    console.log('REPORT_STATUS', reportRes.status);
    console.log('REPORT_BODY', await reportRes.text());
  } catch (error) {
    console.error('ERROR', error);
  }
})();
