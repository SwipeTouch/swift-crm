import { useEffect, useState } from 'react';
import { Card, Table, Button, Modal, Form, Input, Space, Row, Typography, Popconfirm, Tag, App } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import api from '../api';
import { useAuth, isAdmin, canManageData } from '../auth';
import { compareNumber, compareText, sequenceColumn } from '../tableSort';

const { Title } = Typography;

export default function Funnels() {
  const { user } = useAuth();
  const { message } = App.useApp();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form] = Form.useForm();

  const load = () => {
    setLoading(true);
    api.get('/funnels').then((r) => setData(r.data.data)).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const openModal = (funnel) => {
    setEditing(funnel || null);
    setOpen(true);
    setTimeout(() => {
      if (funnel) form.setFieldsValue(funnel);
      else form.resetFields();
    }, 0);
  };

  const save = async () => {
    const values = await form.validateFields();
    try {
      if (editing) await api.put(`/funnels/${editing.id}`, values);
      else await api.post('/funnels', values);
      message.success('Saved');
      setOpen(false);
      load();
    } catch (e) {
      message.error(e.response?.data?.error || 'Save failed');
    }
  };

  const remove = async (f) => {
    try {
      await api.delete(`/funnels/${f.id}`);
      message.success('Funnel deleted (its leads were kept and unassigned)');
      load();
    } catch (e) {
      message.error(e.response?.data?.error || 'Delete failed');
    }
  };

  const columns = [
    sequenceColumn,
    { title: 'Funnel', dataIndex: 'name', key: 'name', sorter: (a, b) => compareText(a.name, b.name) },
    { title: 'Description', dataIndex: 'description', key: 'description', sorter: (a, b) => compareText(a.description, b.description), render: (v) => v || '—' },
    { title: 'Leads', dataIndex: 'leadCount', key: 'leadCount', sorter: (a, b) => compareNumber(a.leadCount, b.leadCount), render: (v) => <Tag>{v}</Tag> },
    canManageData(user) && {
      title: 'Actions', key: 'actions', width: 180,
      render: (_, r) => (
        <Space>
          <Button size="small" onClick={() => openModal(r)}>Edit</Button>
          {isAdmin(user) && (
            <Popconfirm title="Delete this funnel?" description="Leads stay in the pool, just unassigned." onConfirm={() => remove(r)} okText="Delete" okButtonProps={{ danger: true }}>
              <Button size="small" danger>Delete</Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ].filter(Boolean);

  return (
    <div>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>Funnels</Title>
        {canManageData(user) && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal(null)}>New funnel</Button>
        )}
      </Row>
      <Card size="small">
        <Table rowKey="id" loading={loading} columns={columns} dataSource={data} pagination={false} showSorterTooltip={{ title: 'Sort' }} scroll={{ x: 'max-content' }} />
      </Card>

      <Modal open={open} title={editing ? 'Edit funnel' : 'New funnel'} onOk={save} onCancel={() => setOpen(false)} destroyOnHidden>
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="Name" rules={[{ required: true }]}>
            <Input placeholder="e.g. North India Schools" />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={3} placeholder="Optional" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
