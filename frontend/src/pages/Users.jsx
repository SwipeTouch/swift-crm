import { useEffect, useState } from 'react';
import { Card, Table, Button, Modal, Form, Input, Select, Space, Row, Tag, Switch, Typography, App } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import api from '../api';
import { useAuth } from '../auth';
import { compareText, sequenceColumn } from '../tableSort';

const { Title } = Typography;
const ROLE_OPTIONS = [
  { value: 'SUPER_ADMIN', label: 'Super Admin' },
  { value: 'MANAGER', label: 'Manager' },
  { value: 'SALES_REP', label: 'Sales Rep' },
];
const ROLE_LABEL = { SUPER_ADMIN: 'Super Admin', MANAGER: 'Manager', SALES_REP: 'Sales Rep' };
const ROLE_COLOR = { SUPER_ADMIN: 'gold', MANAGER: 'blue', SALES_REP: 'green' };

export default function Users() {
  const { message } = App.useApp();
  const { user: me } = useAuth();
  const isSuperAdmin = me?.role === 'SUPER_ADMIN';
  // Managers may assign Manager / Sales Rep, but not Super Admin.
  const roleOptions = isSuperAdmin ? ROLE_OPTIONS : ROLE_OPTIONS.filter((o) => o.value !== 'SUPER_ADMIN');
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [funnels, setFunnels] = useState([]);
  const [form] = Form.useForm();

  const load = () => {
    setLoading(true);
    api.get('/users').then((r) => setData(r.data.data)).finally(() => setLoading(false));
  };
  useEffect(load, []);
  useEffect(() => { api.get('/funnels').then((r) => setFunnels(r.data.data)).catch(() => {}); }, []);

  const openModal = (u) => {
    setEditing(u || null);
    setOpen(true);
    setTimeout(() => {
      if (u) {
        form.setFieldsValue({
          name: u.name, email: u.email, role: u.role, region: u.region, active: u.active,
          locked: u.locked, canExport: u.canExport,
          funnelIds: (u.funnelAccess || []).map((f) => f.id),
        });
      } else {
        form.resetFields();
      }
    }, 0);
  };

  const save = async () => {
    const values = await form.validateFields();
    try {
      if (editing) {
        const payload = {
          name: values.name, role: values.role, region: values.region, active: values.active,
          locked: !!values.locked, canExport: values.canExport !== false,
        };
        if (values.password) payload.password = values.password;
        if (isSuperAdmin) payload.funnelIds = values.funnelIds || [];
        await api.put(`/users/${editing.id}`, payload);
      } else {
        await api.post('/users', values);
      }
      message.success('Saved');
      setOpen(false);
      load();
    } catch (e) {
      message.error(e.response?.data?.error || 'Save failed');
    }
  };

  const columns = [
    sequenceColumn,
    { title: 'Name', dataIndex: 'name', key: 'name', sorter: (a, b) => compareText(a.name, b.name) },
    { title: 'Email', dataIndex: 'email', key: 'email', sorter: (a, b) => compareText(a.email, b.email) },
    { title: 'Role', dataIndex: 'role', key: 'role', sorter: (a, b) => compareText(ROLE_LABEL[a.role], ROLE_LABEL[b.role]), render: (r) => <Tag color={ROLE_COLOR[r]}>{ROLE_LABEL[r]}</Tag> },
    { title: 'Region', dataIndex: 'region', key: 'region', sorter: (a, b) => compareText(a.region, b.region), render: (v) => v || '—' },
    {
      title: 'Funnel access', key: 'funnelAccess',
      sorter: (a, b) => compareText(
        (a.funnelAccess || []).map((f) => f.name).join(', '),
        (b.funnelAccess || []).map((f) => f.name).join(', '),
      ),
      render: (_, r) =>
        r.funnelAccess && r.funnelAccess.length
          ? r.funnelAccess.map((f) => <Tag key={f.id} color="purple">{f.name}</Tag>)
          : <span style={{ color: '#aaa' }}>—</span>,
    },
    { title: 'Status', dataIndex: 'active', key: 'active', sorter: (a, b) => Number(b.active) - Number(a.active), render: (a) => a ? <Tag color="green">Active</Tag> : <Tag>Disabled</Tag> },
    {
      title: 'Access', key: 'access',
      sorter: (a, b) => Number(!!a.locked) - Number(!!b.locked) || Number(a.canExport === false) - Number(b.canExport === false),
      render: (_, r) => (
        <Space size={4} wrap>
          {r.locked ? <Tag color="red">View-only</Tag> : <Tag color="green">Can edit</Tag>}
          {r.canExport === false && <Tag color="orange">No export</Tag>}
        </Space>
      ),
    },
    {
      title: 'Actions', key: 'actions', width: 120,
      render: (_, r) =>
        !isSuperAdmin && r.role === 'SUPER_ADMIN'
          ? null
          : <Button size="small" onClick={() => openModal(r)}>Edit</Button>,
    },
  ];

  return (
    <div>
      <Row justify="space-between" align="middle" gutter={[8, 12]} style={{ marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>Users</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal(null)}>New user</Button>
      </Row>
      <Card size="small">
        <Table rowKey="id" loading={loading} columns={columns} dataSource={data} pagination={false} showSorterTooltip={{ title: 'Sort' }} scroll={{ x: 'max-content' }} />
      </Card>

      <Modal open={open} title={editing ? 'Edit user' : 'New user'} onOk={save} onCancel={() => setOpen(false)} destroyOnHidden>
        <Form form={form} layout="vertical" initialValues={{ role: 'SALES_REP', active: true, locked: false, canExport: true }}>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email' }]}>
            <Input disabled={!!editing} />
          </Form.Item>
          <Space style={{ width: '100%' }} size="middle">
            <Form.Item name="role" label="Role" rules={[{ required: true }]} style={{ flex: 1, minWidth: 160 }}>
              <Select options={roleOptions} />
            </Form.Item>
            <Form.Item name="region" label="Region" style={{ flex: 1, minWidth: 160 }} tooltip="Managers are scoped to this region. Leave blank for all regions.">
              <Input placeholder="e.g. North" />
            </Form.Item>
          </Space>
          <Form.Item
            name="password"
            label={editing ? 'Reset password (optional)' : 'Password'}
            rules={editing ? [] : [{ required: true, min: 8, message: 'At least 8 characters' }]}
          >
            <Input.Password placeholder={editing ? 'Leave blank to keep current' : 'Min 8 characters'} />
          </Form.Item>
          {isSuperAdmin && (
            <Form.Item
              name="funnelIds"
              label="Funnel access"
              tooltip="Leads this user can see and work are limited to these funnels. Leave empty to use the role's default scope (region / own leads)."
            >
              <Select
                mode="multiple"
                allowClear
                placeholder="Assign one or more funnels"
                options={funnels.map((f) => ({ value: f.id, label: f.name }))}
              />
            </Form.Item>
          )}
          <Space size="large" wrap>
            <Form.Item name="locked" label="Lock (view-only)" valuePropName="checked" tooltip="When on, this user can view but not add, edit, or move leads — regardless of the global setting.">
              <Switch />
            </Form.Item>
            <Form.Item name="canExport" label="Allow export & print" valuePropName="checked" tooltip="Lets this user export/print leads. Still requires export to be enabled globally in Configuration.">
              <Switch />
            </Form.Item>
            {editing && (
              <Form.Item name="active" label="Active" valuePropName="checked">
                <Switch />
              </Form.Item>
            )}
          </Space>
        </Form>
      </Modal>
    </div>
  );
}
