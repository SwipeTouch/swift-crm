import { useEffect, useState } from 'react';
import { Card, Upload, Button, Select, Typography, Space, Alert, Table, Divider, App } from 'antd';
import { InboxOutlined, DownloadOutlined } from '@ant-design/icons';
import api from '../api';
import { compareNumber, compareText, sequenceColumn } from '../tableSort';

const { Title, Paragraph, Text } = Typography;
const { Dragger } = Upload;

export default function ImportPage() {
  const { message } = App.useApp();
  const [funnels, setFunnels] = useState([]);
  const [funnelId, setFunnelId] = useState(undefined);
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    api.get('/funnels').then((r) => setFunnels(r.data.data)).catch(() => {});
  }, []);

  const downloadFile = async (path, filename) => {
    try {
      const r = await api.get(path, { responseType: 'blob' });
      const url = URL.createObjectURL(r.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      message.error('Could not download file');
    }
  };

  const doUpload = async () => {
    if (!file) return message.warning('Choose a file first');
    const fd = new FormData();
    fd.append('file', file);
    if (funnelId) fd.append('funnelId', funnelId);
    setUploading(true);
    setResult(null);
    try {
      const r = await api.post('/import', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setResult(r.data);
      message.success(`Imported ${r.data.created} leads`);
      setFile(null);
    } catch (e) {
      message.error(e.response?.data?.error || 'Import failed');
      if (e.response?.data?.errors) setResult({ created: 0, ...e.response.data });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={{ maxWidth: 760 }}>
      <Title level={3}>Import leads from XLSX</Title>
      <Card>
        <Paragraph>
          Upload an Excel/CSV file of schools. The first row must be a header. Recognised columns:{' '}
          <Text code>School Name</Text>, <Text code>Board</Text>, <Text code>Student Strength</Text>,{' '}
          <Text code>Region</Text>, <Text code>Location</Text>, <Text code>Contact Name</Text>,{' '}
          <Text code>Contact Type</Text>, <Text code>Contact Phone</Text>, <Text code>Stage</Text>,{' '}
          <Text code>Source</Text>, <Text code>Total Contract Value</Text>, <Text code>PSPM Rate</Text>,{' '}
          <Text code>Lead Date</Text>, <Text code>Reminder</Text>. Only <Text strong>School Name</Text> is
          required for import. Download the sample file for a filled sheet you can import as-is.
        </Paragraph>
        <Space style={{ marginBottom: 16 }} wrap>
          <Button icon={<DownloadOutlined />} onClick={() => downloadFile('/import/template', 'leads-import-template.xlsx')}>Download template</Button>
          <Button icon={<DownloadOutlined />} onClick={() => downloadFile('/import/sample', 'leads-import-sample.xlsx')}>Download sample</Button>
          <Select
            allowClear style={{ minWidth: 240 }} placeholder="Assign all rows to a funnel (optional)"
            value={funnelId} onChange={setFunnelId}
            options={funnels.map((f) => ({ value: f.id, label: f.name }))}
          />
        </Space>

        <Dragger
          multiple={false}
          maxCount={1}
          beforeUpload={(f) => { setFile(f); setResult(null); return false; }}
          onRemove={() => setFile(null)}
          accept=".xlsx,.xls,.csv"
          fileList={file ? [file] : []}
        >
          <p className="ant-upload-drag-icon"><InboxOutlined /></p>
          <p className="ant-upload-text">Click or drag an .xlsx / .csv file here</p>
          <p className="ant-upload-hint">Max 5 MB. Nothing is imported until you click Import below.</p>
        </Dragger>

        <Button type="primary" style={{ marginTop: 16 }} loading={uploading} disabled={!file} onClick={doUpload}>
          Import
        </Button>
      </Card>

      {result && (
        <Card style={{ marginTop: 16 }}>
          <Alert
            type={result.created > 0 ? 'success' : 'warning'}
            message={`${result.created} leads imported, ${result.skipped || (result.errors ? result.errors.length : 0)} skipped`}
            showIcon
          />
          {result.errors && result.errors.length > 0 && (
            <>
              <Divider>Skipped rows</Divider>
              <Table
                size="small" rowKey={(r) => r.row} pagination={false}
                columns={[
                  sequenceColumn,
                  { title: 'Row', dataIndex: 'row', width: 80, sorter: (a, b) => compareNumber(a.row, b.row) },
                  { title: 'Reason', dataIndex: 'error', sorter: (a, b) => compareText(a.error, b.error) },
                ]}
                showSorterTooltip={{ title: 'Sort' }}
                dataSource={result.errors}
              />
            </>
          )}
        </Card>
      )}
    </div>
  );
}
