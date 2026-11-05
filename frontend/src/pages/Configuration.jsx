import { useEffect, useState } from 'react';
import {
  Card, Typography, Button, Input, InputNumber, Space, Switch, Row, Col, Divider, Checkbox, Tag, ColorPicker, Upload, App, Tooltip,
} from 'antd';
import { PlusOutlined, DeleteOutlined, ArrowUpOutlined, ArrowDownOutlined, UploadOutlined } from '@ant-design/icons';
import api from '../api';
import { useConfig } from '../config';

const { Title, Text, Paragraph } = Typography;

// All columns that can be granted to Sales Reps (must match the pool's list).
const COLUMN_LABELS = [
  { key: 'board', label: 'Board' },
  { key: 'studentStrength', label: 'Students' },
  { key: 'totalContractValue', label: 'TCV' },
  { key: 'cac', label: 'CAC' },
  { key: 'ageing', label: 'Ageing' },
  { key: 'reminder', label: 'Reminder' },
  { key: 'region', label: 'Region' },
  { key: 'contact', label: 'Contact' },
  { key: 'funnel', label: 'Funnel' },
  { key: 'owner', label: 'Owner' },
  { key: 'stage', label: 'Stage' },
];

const toHex = (c) => (typeof c === 'string' ? c : c && c.toHexString ? c.toHexString() : '#8c8c8c');

export default function Configuration() {
  const { config, reload } = useConfig();
  const { message } = App.useApp();

  const [stages, setStages] = useState([]);
  const [repColumns, setRepColumns] = useState([]);
  const [exportEnabled, setExportEnabled] = useState(true);
  const [readOnly, setReadOnly] = useState(false);
  const [repsReadOnly, setRepsReadOnly] = useState(false);
  const [ageingThresholdDays, setAgeingThresholdDays] = useState(20);
  const [po, setPo] = useState({});
  const [logo, setLogo] = useState(null);
  const [saving, setSaving] = useState(false);
  const setPoField = (k, v) => setPo((p) => ({ ...p, [k]: v }));

  // Seed local editable state from the loaded config.
  useEffect(() => {
    setStages((config.stages || []).map((s) => ({ ...s })));
    setRepColumns(config.repColumns || []);
    setExportEnabled(!!config.exportEnabled);
    setReadOnly(!!config.readOnly);
    setRepsReadOnly(!!config.repsReadOnly);
    setAgeingThresholdDays(config.ageingThresholdDays ?? 20);
    setPo(config.poTemplate || {});
    setLogo(config.logo || null);
  }, [config]);

  const uploadLogo = async (file) => {
    const fd = new FormData();
    fd.append('file', file);
    try {
      const r = await api.post('/config/logo', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setLogo(r.data.logo);
      await reload();
      message.success('Logo updated');
    } catch (e) {
      message.error(e.response?.data?.error || 'Logo upload failed');
    }
    return false;
  };

  const updateStage = (i, patch) => setStages((arr) => arr.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  const addStage = () => setStages((arr) => [...arr, { name: 'New stage', color: '#14b8a6' }]);
  const removeStage = (i) => setStages((arr) => arr.filter((_, idx) => idx !== i));
  const move = (i, dir) => setStages((arr) => {
    const j = i + dir;
    if (j < 0 || j >= arr.length) return arr;
    const copy = [...arr];
    [copy[i], copy[j]] = [copy[j], copy[i]];
    return copy;
  });

  const save = async () => {
    if (!stages.length) return message.error('Keep at least one stage');
    if (stages.some((s) => !s.name || !s.name.trim())) return message.error('Every stage needs a name');
    setSaving(true);
    try {
      await api.put('/config', {
        stages: stages.map((s) => ({ id: s.id, name: s.name.trim(), color: toHex(s.color) })),
        repColumns,
        exportEnabled,
        readOnly,
        repsReadOnly,
        ageingThresholdDays,
        poTemplate: po,
      });
      await reload();
      message.success('Configuration saved');
    } catch (e) {
      message.error(e.response?.data?.error || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ maxWidth: 820 }}>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>Configuration</Title>
        <Button type="primary" loading={saving} onClick={save}>Save changes</Button>
      </Row>

      <Card title="Lead stages" size="small" style={{ marginBottom: 16 }}>
        <Paragraph type="secondary" style={{ marginTop: 0 }}>
          Define your pipeline stages, their order (left→right = early→late), and the colour each is highlighted with.
          A stage still used by leads can't be removed until those leads are moved.
        </Paragraph>
        <Space direction="vertical" style={{ width: '100%' }}>
          {stages.map((s, i) => (
            <Row key={i} gutter={8} align="middle" wrap={false}>
              <Col flex="24px"><Text type="secondary">{i + 1}</Text></Col>
              <Col flex="auto">
                <Input value={s.name} onChange={(e) => updateStage(i, { name: e.target.value })} placeholder="Stage name" />
              </Col>
              <Col flex="40px">
                <ColorPicker value={s.color} onChange={(c) => updateStage(i, { color: toHex(c) })} />
              </Col>
              <Col flex="90px"><Tag color={toHex(s.color)}>{s.name || '—'}</Tag></Col>
              <Col flex="none">
                <Space size={2}>
                  <Tooltip title="Move earlier"><Button size="small" icon={<ArrowUpOutlined />} disabled={i === 0} onClick={() => move(i, -1)} /></Tooltip>
                  <Tooltip title="Move later"><Button size="small" icon={<ArrowDownOutlined />} disabled={i === stages.length - 1} onClick={() => move(i, 1)} /></Tooltip>
                  <Tooltip title="Remove"><Button size="small" danger icon={<DeleteOutlined />} onClick={() => removeStage(i)} /></Tooltip>
                </Space>
              </Col>
            </Row>
          ))}
        </Space>
        <Button icon={<PlusOutlined />} onClick={addStage} style={{ marginTop: 12 }}>Add stage</Button>
      </Card>

      <Card title="Access & export" size="small" style={{ marginBottom: 16 }}>
        <Row align="middle" style={{ marginBottom: 12 }}>
          <Col flex="auto">
            <Text strong>Export &amp; print</Text>
            <div><Text type="secondary">When off, no one can export or print leads.</Text></div>
          </Col>
          <Col><Switch checked={exportEnabled} onChange={setExportEnabled} /></Col>
        </Row>
        <Divider style={{ margin: '8px 0' }} />
        <Row align="middle" style={{ marginBottom: 12 }}>
          <Col flex="auto">
            <Text strong>Global read-only (lock editing)</Text>
            <div><Text type="secondary">Everyone except Super Admin can view but not add, edit, or move leads.</Text></div>
          </Col>
          <Col><Switch checked={readOnly} onChange={setReadOnly} /></Col>
        </Row>
        <Divider style={{ margin: '8px 0' }} />
        <Row align="middle">
          <Col flex="auto">
            <Text strong>Sales Reps view-only</Text>
            <div><Text type="secondary">Sales Reps (incl. State Heads) can view but not change leads. Managers keep editing.</Text></div>
          </Col>
          <Col><Switch checked={repsReadOnly} onChange={setRepsReadOnly} /></Col>
        </Row>
      </Card>

      <Card title="Display" size="small" style={{ marginBottom: 16 }}>
        <Row align="middle">
          <Col flex="auto">
            <Text strong>Highlight ageing after</Text>
            <div><Text type="secondary">Leads whose ageing reaches this many days show their Ageing value in red.</Text></div>
          </Col>
          <Col>
            <InputNumber min={1} value={ageingThresholdDays} onChange={(v) => setAgeingThresholdDays(v || 1)} addonAfter="days" />
          </Col>
        </Row>
      </Card>

      <Card title="Purchase Order template" size="small" style={{ marginBottom: 16 }}>
        <Paragraph type="secondary" style={{ marginTop: 0 }}>
          Used when a deal is marked Closure. Set your company details, logo and the Annexure text once — every PO uses them.
        </Paragraph>
        <Row gutter={12}>
          <Col xs={24} md={16}>
            <Row gutter={12}>
              <Col xs={24} md={12}>
                <Text strong>Company name</Text>
                <Input value={po.companyName} onChange={(e) => setPoField('companyName', e.target.value)} style={{ marginBottom: 10 }} />
              </Col>
              <Col xs={24} md={12}>
                <Text strong>Product / service name</Text>
                <Input value={po.productName} onChange={(e) => setPoField('productName', e.target.value)} style={{ marginBottom: 10 }} />
              </Col>
            </Row>
            <Text strong>Company address</Text>
            <Input value={po.companyAddress} onChange={(e) => setPoField('companyAddress', e.target.value)} style={{ marginBottom: 10 }} />
            <Row gutter={12}>
              <Col xs={24} md={8}>
                <Text strong>Phone</Text>
                <Input value={po.companyPhone} onChange={(e) => setPoField('companyPhone', e.target.value)} style={{ marginBottom: 10 }} />
              </Col>
              <Col xs={24} md={10}>
                <Text strong>Email</Text>
                <Input value={po.companyEmail} onChange={(e) => setPoField('companyEmail', e.target.value)} style={{ marginBottom: 10 }} />
              </Col>
              <Col xs={24} md={6}>
                <Text strong>PO number prefix</Text>
                <Input value={po.numberPrefix} onChange={(e) => setPoField('numberPrefix', e.target.value)} style={{ marginBottom: 10 }} />
              </Col>
            </Row>
          </Col>
          <Col xs={24} md={8}>
            <Text strong>Company logo</Text>
            <div style={{ border: '1px dashed #d9d9d9', borderRadius: 8, padding: 12, textAlign: 'center', marginTop: 4 }}>
              {logo
                ? <img src={logo} alt="logo" style={{ maxHeight: 70, maxWidth: '100%', marginBottom: 8 }} />
                : <div style={{ color: '#aaa', marginBottom: 8 }}>No logo</div>}
              <Upload accept="image/*" showUploadList={false} beforeUpload={uploadLogo}>
                <Button icon={<UploadOutlined />} size="small">Upload logo</Button>
              </Upload>
            </div>
          </Col>
        </Row>

        <Text strong>Bank details</Text>
        <Input.TextArea rows={4} value={po.bankDetails} onChange={(e) => setPoField('bankDetails', e.target.value)} style={{ marginBottom: 10 }} />
        <Text strong>Annexure 1 — Modules offered</Text>
        <Paragraph type="secondary" style={{ margin: '2px 0' }}>One item per line.</Paragraph>
        <Input.TextArea rows={6} value={po.modules} onChange={(e) => setPoField('modules', e.target.value)} style={{ marginBottom: 10 }} />
        <Text strong>Annexure 2 — Terms &amp; Conditions</Text>
        <Paragraph type="secondary" style={{ margin: '2px 0' }}>One clause per line.</Paragraph>
        <Input.TextArea rows={6} value={po.terms} onChange={(e) => setPoField('terms', e.target.value)} />
      </Card>

      <Card title="Columns Sales Reps can see" size="small">
        <Paragraph type="secondary" style={{ marginTop: 0 }}>
          Choose which leads-pool columns Sales Reps are allowed to see. They can still hide columns within this set.
          (Managers and Super Admin always see all columns.)
        </Paragraph>
        <Checkbox.Group
          value={repColumns}
          onChange={setRepColumns}
          options={COLUMN_LABELS.map((c) => ({ label: c.label, value: c.key }))}
          style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}
        />
      </Card>
    </div>
  );
}
