// Sinh mã phiếu tăng dần, atomic qua Postgres sequence. client = trong transaction (nếu có).
export async function nextCode(client, prefix, seq, pad = 6) {
  const { rows } = await client.query(`SELECT nextval($1) AS n`, [seq]);
  const num = String(rows[0].n).padStart(pad, "0");
  return `${prefix}-${num}`;
}
