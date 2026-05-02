const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function pad(n) {
  return String(n).padStart(2, '0');
}

function getMonthRange(date = new Date()) {
  const year = date.getFullYear();
  const month = date.getMonth();
  const start = new Date(Date.UTC(year, month, 1, 0, 0, 0));
  const end = new Date(Date.UTC(year, month + 1, 1, 0, 0, 0));
  const label = `${year}-${pad(month + 1)}`;
  return { start, end, label };
}

function escapeCsv(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

async function exportMonthlyTransactions() {
  const { start, end, label } = getMonthRange(new Date());
  const outDir = path.join(__dirname, '..', 'output');
  const outFile = path.join(outDir, `transactions-${label}.csv`);

  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const { data, error } = await supabase
    .from('economy_transactions')
    .select('*')
    .gte('created_at', start.toISOString())
    .lt('created_at', end.toISOString())
    .order('created_at', { ascending: true });

  if (error) throw error;

  const headers = [
    'id',
    'guild_id',
    'user_id',
    'username',
    'type',
    'amount',
    'balance_after',
    'target_user_id',
    'target_username',
    'notes',
    'metadata',
    'created_at'
  ];

  const rows = (data || []).map(row => [
    row.id,
    row.guild_id,
    row.user_id,
    row.username,
    row.type,
    row.amount,
    row.balance_after,
    row.target_user_id,
    row.target_username,
    row.notes,
    JSON.stringify(row.metadata || {}),
    row.created_at
  ]);

  const csv = [
    headers.map(escapeCsv).join(','),
    ...rows.map(r => r.map(escapeCsv).join(','))
  ].join('\n');

  fs.writeFileSync(outFile, csv, 'utf8');
  return outFile;
}

exportMonthlyTransactions()
  .then(file => {
    console.log(`Exported to ${file}`);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
