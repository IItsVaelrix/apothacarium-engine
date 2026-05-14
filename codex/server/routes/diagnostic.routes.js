import { getLatestReport, summary } from '../collab/diagnostic.mcp.js';
import { requireAuth } from '../auth-pre-handler.js';

export async function diagnosticRoutes(fastify, options) {
  // GET /api/diagnostic/latest
  // Fetches the full latest diagnostic report
  fastify.get('/latest', {
    // Optionally require auth: preHandler: [requireAuth]
  }, async (request, reply) => {
    try {
      const report = await getLatestReport();
      if (!report) {
        return reply.status(404).send({ error: 'No diagnostic reports found' });
      }
      return reply.send(report);
    } catch (err) {
      fastify.log.error({ err }, '[DIAGNOSTIC] Failed to fetch latest report');
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  });

  // GET /api/diagnostic/summary
  // Quick at-a-glance numbers from the latest report
  fastify.get('/summary', async (request, reply) => {
    try {
      const data = await summary();
      if (!data.reportId) {
        return reply.status(404).send({ error: 'No diagnostic reports found' });
      }
      return reply.send(data);
    } catch (err) {
      fastify.log.error({ err }, '[DIAGNOSTIC] Failed to fetch summary');
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  });

  // WS /api/diagnostic/stream
  // Streams real-time diagnostic events
  fastify.get('/stream', { websocket: true }, (connection, req) => {
    // We send a ping_start to signal connection active
    connection.socket.send(JSON.stringify({ type: 'ping_start', timestamp: Date.now() }));

    // Send latest on connect
    getLatestReport().then(report => {
      if (report) {
         connection.socket.send(JSON.stringify({ type: 'scan_complete', report }));
      }
    }).catch(err => {
      fastify.log.error({ err }, '[DIAGNOSTIC] WS initial fetch failed');
    });

    // In a real system, we'd hook into `DiagnosticRunnerEvents` or an event emitter.
    // Assuming `diagnostic-runner` emits events globally or we poll the file system changes.
    // Since Phase 4 specifies pushing updates, we'll set up a mock watcher or a basic polling mechanism
    // here to simulate the stream, or if the actual runner exports an EventEmitter, attach to it.
    
    // For now, let's poll `getLatestReport` every 10s and send if changed
    let lastChecksum = null;
    const interval = setInterval(async () => {
       try {
         const report = await getLatestReport();
         if (report && report.checksum !== lastChecksum) {
           lastChecksum = report.checksum;
           connection.socket.send(JSON.stringify({ type: 'scan_complete', report }));
         }
       } catch (err) {
         // ignore
       }
    }, 10000);

    connection.socket.on('close', () => {
      clearInterval(interval);
    });
  });
}
