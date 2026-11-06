import { useEffect, useState } from 'react';
import { Modal, InputNumber, Typography, Divider, Row, Col, App, Empty } from 'antd';
import api from '../api';

const { Text } = Typography;
const rupee = {
  formatter: (v) => (v ? `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : ''),
  parser: (v) => (v || '').replace(/,/g, ''),
  prefix: '₹',
  min: 0,
  style: { width: '100%' },
};

// Super-Admin editor for FY sales targets (overall + per region / funnel / sales person).
export default function TargetsModal({ fy, open, onClose, onSaved }) {
  const { message } = App.useApp();
  const [regions, setRegions] = useState([]);
  const [funnels, setFunnels] = useState([]);
  const [users, setUsers] = useState([]);
  const [amt, setAmt] = useState({});
  const [saving, setSaving] = useState(false);
  const k = (dim, ref) => `${dim}:${ref ?? ''}`;

  useEffect(() => {
    if (!open) return;
    Promise.all([
      api.get('/targets', { params: { fy } }),
      api.get('/leads/filters'),
      api.get('/funnels'),
      api.get('/users'),
    ]).then(([t, f, fn, u]) => {
      const m = {};
      t.data.targets.forEach((x) => { m[k(x.dimension, x.refKey)] = x.amount; });
      setAmt(m);
      setRegions(f.data.regions || []);
      setFunnels(fn.data.data || []);
      setUsers(u.data.data || []);
    }).catch(() => {});
  }, [open, fy]);

  const set = (dim, ref, v) => setAmt((a) => ({ ...a, [k(dim, ref)]: v }));

  const save = async () => {
    setSaving(true);
    const targets = [{ dimension: 'OVERALL', amount: amt[k('OVERALL', '')] || 0 }];
    regions.forEach((r) => targets.push({ dimension: 'REGION', refKey: r, amount: amt[k('REGION', r)] || 0 }));
    funnels.forEach((f) => targets.push({ dimension: 'FUNNEL', refKey: String(f.id), amount: amt[k('FUNNEL', f.id)] || 0 }));
    users.forEach((u) => targets.push({ dimension: 'USER', refKey: String(u.id), amount: amt[k('USER', u.id)] || 0 }));
    try {
      await api.put('/targets', { fy, targets });
      message.success('Targets saved');
      onSaved && onSaved();
      onClose();
    } catch (e) {
      message.error(e.response?.data?.error || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const rows = (list, dim, labelOf, refOf) => (
    list.length ? list.map((item) => {
      const ref = refOf(item);
      return (
        <Row key={ref} align="middle" gutter={8} style={{ marginBottom: 8 }}>
          <Col flex="auto"><Text>{labelOf(item)}</Text></Col>
          <Col flex="200px">
            <InputNumber {...rupee} value={amt[k(dim, ref)]} onChange={(v) => set(dim, ref, v)} placeholder="No target" />
          </Col>
        </Row>
      );
    }) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="None" />
  );

  return (
    <Modal open={open} title={`Set Sales Targets — FY ${fy}`} onOk={save} confirmLoading={saving} okText="Save targets" onCancel={onClose} width={620} style={{ maxWidth: 'calc(100vw - 16px)' }}>
      <div style={{ maxHeight: '60vh', overflowY: 'auto', paddingRight: 8 }}>
        <Divider orientation="left" style={{ marginTop: 0 }}>Overall FY target</Divider>
        <InputNumber {...rupee} value={amt[k('OVERALL', '')]} onChange={(v) => set('OVERALL', '', v)} placeholder="Overall target for the year" />

        <Divider orientation="left">By Region / Territory</Divider>
        {rows(regions, 'REGION', (r) => r, (r) => r)}

        <Divider orientation="left">By Funnel</Divider>
        {rows(funnels, 'FUNNEL', (f) => f.name, (f) => f.id)}

        <Divider orientation="left">By Sales Person</Divider>
        {rows(users, 'USER', (u) => `${u.name} (${u.role === 'SALES_REP' ? 'Rep' : u.role === 'MANAGER' ? 'Manager' : 'Admin'})`, (u) => u.id)}
      </div>
    </Modal>
  );
}
