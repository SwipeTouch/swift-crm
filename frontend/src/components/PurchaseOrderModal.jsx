import { useEffect, useState } from 'react';
import {
  Modal, Form, Input, InputNumber, Select, DatePicker, Radio, Button, Space, Divider, Alert, Typography, Grid, App,
} from 'antd';
import { PlusOutlined, DeleteOutlined, FilePdfOutlined, FileWordOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import api from '../api';
import { inr } from '../format';

const { Text } = Typography;
const ADDRESSEE_OPTIONS = ['Principal', 'Director', 'Promoter', 'Chairman'].map((v) => ({ value: v, label: v }));

// Collects Purchase Order details for a closed lead and generates the document.
export default function PurchaseOrderModal({ lead, open, onClose, canWrite }) {
  const [form] = Form.useForm();
  const { message } = App.useApp();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const screens = Grid.useBreakpoint();
  const phone = screens.md === false;
  const row = { display: 'flex', gap: 12, flexDirection: phone ? 'column' : 'row' };
  const field = { flex: phone ? 'none' : 1, width: phone ? '100%' : undefined };

  const valueType = Form.useWatch('valueType', form);
  const perStudentRate = Form.useWatch('perStudentRate', form);
  const studentStrength = Form.useWatch('studentStrength', form);
  const monthlyAmount = Form.useWatch('monthlyAmount', form);
  const base = (valueType === 'PSPM') ? (perStudentRate || 0) * (studentStrength || 0) : (monthlyAmount || 0);
  const gst = Math.round(base * 18) / 100;

  useEffect(() => {
    if (!open || !lead) return;
    setSaved(false);
    api.get(`/leads/${lead.id}/po`).then((r) => {
      const po = r.data.po;
      if (po) {
        form.setFieldsValue({
          ...po,
          dealDate: po.dealDate ? dayjs(po.dealDate) : dayjs(),
          contractExpiry: po.contractExpiry ? dayjs(po.contractExpiry) : null,
        });
        setSaved(true);
      } else {
        form.resetFields();
        form.setFieldsValue({
          dealDate: dayjs(),
          valueType: lead.pspmRate ? 'PSPM' : 'LUMPSUM',
          perStudentRate: lead.pspmRate || undefined,
          studentStrength: lead.studentStrength || undefined,
          billingCycle: 'MONTHLY',
          schoolName: lead.schoolName,
          board: lead.board || undefined,
          addresseeTitle: 'Principal',
          contacts: [{ name: lead.contactName || '', email: '', phone: lead.contactPhone || '' }],
        });
      }
    }).catch(() => {});
  }, [open, lead, form]);

  const save = async () => {
    let values;
    try { values = await form.validateFields(); } catch (e) { return; }
    setSaving(true);
    try {
      await api.post(`/leads/${lead.id}/po`, {
        ...values,
        dealDate: values.dealDate ? values.dealDate.toISOString() : undefined,
        contractExpiry: values.contractExpiry ? values.contractExpiry.toISOString() : null,
      });
      setSaved(true);
      message.success('Purchase order saved');
    } catch (e) {
      message.error(e.response?.data?.error || 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const download = async (format) => {
    try {
      const r = await api.get(`/leads/${lead.id}/po/document`, { params: { format }, responseType: 'blob' });
      const url = URL.createObjectURL(r.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `PO-${(lead.schoolName || 'order').replace(/[^a-z0-9]+/gi, '-')}.${format === 'docx' ? 'docx' : 'pdf'}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      message.error(e.response?.data?.error || 'Download failed');
    }
  };

  return (
    <Modal
      open={open}
      title="Purchase Order"
      onCancel={onClose}
      width={phone ? 'calc(100vw - 16px)' : 720}
      style={{ top: phone ? 12 : undefined, maxWidth: 'calc(100vw - 16px)' }}
      styles={phone ? { body: { maxHeight: '70vh', overflow: 'auto' } } : undefined}
      destroyOnHidden
      footer={[
        <Button key="pdf" icon={<FilePdfOutlined />} disabled={!saved} onClick={() => download('pdf')}>Download PDF</Button>,
        <Button key="docx" icon={<FileWordOutlined />} disabled={!saved} onClick={() => download('docx')}>Download Word</Button>,
        <Button key="close" onClick={onClose}>Close</Button>,
        canWrite && <Button key="save" type="primary" loading={saving} onClick={save}>{saved ? 'Update' : 'Save'}</Button>,
      ].filter(Boolean)}
    >
      <Form form={form} layout="vertical" disabled={!canWrite}>
        <div style={row}>
          <Form.Item name="schoolName" label="School name" style={phone ? field : { flex: 2 }} rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="addresseeTitle" label="Addressee (salutation)" style={field}>
            <Select options={ADDRESSEE_OPTIONS} />
          </Form.Item>
          <Form.Item name="board" label="Board" style={field}>
            <Input placeholder="CBSE / ICSE..." />
          </Form.Item>
        </div>
        <div style={row}>
          <Form.Item name="dealDate" label="Deal date" style={field} rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" />
          </Form.Item>
          <Form.Item name="contractExpiry" label="Contract expiry" style={field}>
            <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" />
          </Form.Item>
          <Form.Item name="billingCycle" label="Billing" style={field}>
            <Select options={[{ value: 'MONTHLY', label: 'Monthly' }, { value: 'QUARTERLY', label: 'Quarterly' }]} />
          </Form.Item>
        </div>

        <Form.Item name="valueType" label="Deal value">
          <Radio.Group style={{ display: 'flex', flexWrap: 'wrap' }}>
            <Radio.Button value="PSPM">Per Student / Month</Radio.Button>
            <Radio.Button value="LUMPSUM">Lump Sum</Radio.Button>
          </Radio.Group>
        </Form.Item>
        {valueType === 'PSPM' ? (
          <div style={row}>
            <Form.Item name="perStudentRate" label="Per student rate (₹/month)" style={field} rules={[{ required: true }]}>
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="studentStrength" label="Total student strength" style={field} rules={[{ required: true }]}>
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
          </div>
        ) : (
          <Form.Item name="monthlyAmount" label="Monthly amount (₹)" rules={[{ required: true }]}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
        )}

        <Alert
          type="info"
          style={{ marginBottom: 16 }}
          message={<span>Monthly base <b>{inr(base)}</b> + 18% GST <b>{inr(gst)}</b> = <b>{inr(base + gst)}</b> / month</span>}
        />

        <Divider orientation="left" style={{ marginTop: 0 }}>Points of Contact</Divider>
        <Form.List name="contacts">
          {(fields, { add, remove }) => (
            <>
              {fields.map(({ key, name, ...rest }) => (
                <Space key={key} align="baseline" direction={phone ? 'vertical' : 'horizontal'} style={{ display: 'flex', marginBottom: 8, width: '100%' }}>
                  <Form.Item {...rest} name={[name, 'name']} rules={[{ required: true, message: 'Name required' }]}>
                    <Input placeholder="Name *" />
                  </Form.Item>
                  <Form.Item {...rest} name={[name, 'email']}>
                    <Input placeholder="Email" />
                  </Form.Item>
                  <Form.Item {...rest} name={[name, 'phone']} rules={[{ required: true, message: 'Phone required' }]}>
                    <Input placeholder="Phone *" />
                  </Form.Item>
                  {fields.length > 1 && <DeleteOutlined onClick={() => remove(name)} />}
                </Space>
              ))}
              <Button type="dashed" onClick={() => add({ name: '', email: '', phone: '' })} icon={<PlusOutlined />} block>
                Add contact
              </Button>
            </>
          )}
        </Form.List>

        {!canWrite && <Text type="secondary">You have view-only access — you can download an existing PO but not edit it.</Text>}
      </Form>
    </Modal>
  );
}
