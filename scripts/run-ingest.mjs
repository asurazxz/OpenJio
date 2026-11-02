// Run inside the API container: the operator key stays in its environment.
const response = await fetch('http://127.0.0.1:8787/api/ingest/run', {
  method: 'POST', headers: { 'X-Ingest-Token': process.env.INGEST_RUN_TOKEN || '' },
});
if (!response.ok && response.status !== 409) throw new Error(`Ingestion was not started (${response.status}). Check API logs.`);
console.log(`${response.status === 409 ? 'Live ingestion is already running.' : 'Live ingestion started.'} Follow the API logs or open /api/ingest/status.`);
