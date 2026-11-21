import { useEffect, useState } from 'react';
import { Card, Upload, Button, Select, DatePicker, Radio, Typography, Alert, Table, Divider, App, theme } from 'antd';
import { InboxOutlined, DownloadOutlined } from '@ant-design/icons';
import api from '../api';
import { compareNumber, compareText, sequenceColumn } from '../tableSort';

const { Title, Paragraph, Text } = Typography;
const { Dragger } = Upload;

export default function ImportPage() {
  const { message } = App.useApp();
  const { token } = theme.useToken();
  const [funnels, setFunnels] = useState([]);
  const [funnelId, setFunnelId] = useState(undefined);
  const [dateMode, setDateMode] = useState('template');
  const [leadDate, setLeadDate] = useState(null);
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
    if (!funnelId) return message.warning('Assign all rows to a funnel');
    if (!file) return message.warning('Choose a file first');
    const fd = new FormData();
    fd.append('file', file);
    fd.append('funnelId', funnelId);
    fd.append('dateMode', dateMode);
    if (dateMode === 'calendar') {
      if (!leadDate) return message.warning('Pick a lead date on the calendar');
      fd.append('leadDate', leadDate.startOf('day').toISOString());
    }
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
          required for import.
        </Paragraph>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div>
            <Text strong>1. Set the lead date</Text>
            <Radio.Group
              value={dateMode}
              onChange={(e) => setDateMode(e.target.value)}
              style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}
            >
              <Radio value="template">Download template and put each date in the sheet</Radio>
              <Radio value="calendar">Use the calendar for every row</Radio>
            </Radio.Group>
            {dateMode === 'template' ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8, marginTop: 12 }}>
                <Button icon={<DownloadOutlined />} onClick={() => downloadFile('/import/template', 'leads-import-template.xlsx')}>
                  Download template
                </Button>
                <Text type="secondary">Header row only. Put each school’s lead date in the Lead Date column.</Text>
                <Button icon={<DownloadOutlined />} onClick={() => downloadFile('/import/sample', 'leads-import-sample.xlsx')}>
                  Download sample
                </Button>
                <Text type="secondary">Several schools, one for each stage: Cold, Warm, Hot, Negotiation, Closure, Not Interested, and Stale.</Text>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8, marginTop: 12 }}>
                <Text>One lead date for every row. Dates already written in the sheet are ignored.</Text>
                <DatePicker
                  value={leadDate}
                  onChange={setLeadDate}
                  format="DD MMM YYYY"
                  allowClear={false}
                  style={{ width: 240 }}
                />
              </div>
            )}
          </div>

          <div>
            <Text strong>2. Assign all rows to a funnel</Text>
            <div style={{ marginTop: 8 }}>
              <style>{`
                .import-funnel.ant-select .ant-select-selector {
                  border-color: ${token.colorText} !important;
                  color: ${token.colorText};
                  background: ${token.colorBgContainer} !important;
                }
                .import-funnel.ant-select .ant-select-selection-item,
                .import-funnel.ant-select .ant-select-selection-placeholder,
                .import-funnel.ant-select .ant-select-arrow {
                  color: ${token.colorText} !important;
                  opacity: 1;
                }
                .import-funnel.ant-select-focused .ant-select-selector {
                  border-color: ${token.colorPrimary} !important;
                  box-shadow: 0 0 0 2px ${token.colorPrimaryBg} !important;
                }
              `}</style>
              <Select
                className="import-funnel"
                size="large"
                placeholder="Assign all rows to a funnel"
                value={funnelId}
                onChange={setFunnelId}
                style={{ width: '100%', maxWidth: 420 }}
                options={funnels.map((f) => ({ value: f.id, label: f.name }))}
              />
            </div>
          </div>

          <div>
            <Text strong>3. Upload the file</Text>
            <div style={{ marginTop: 8 }}>
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
            </div>
          </div>

          <div>
            <Button
              type="primary"
              loading={uploading}
              disabled={!file || !funnelId || (dateMode === 'calendar' && !leadDate)}
              onClick={doUpload}
            >
              4. Import
            </Button>
          </div>
        </div>
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
