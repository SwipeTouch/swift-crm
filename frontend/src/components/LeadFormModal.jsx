import { useEffect } from 'react';
import { Modal, Form, Input, InputNumber, Select, AutoComplete, DatePicker, App } from 'antd';
import dayjs from 'dayjs';
import api from '../api';
import { canManageData, useAuth } from '../auth';
import { useConfig } from '../config';

const BOARD_OPTIONS = ['CBSE', 'ICSE', 'State Board', 'IGCSE', 'IB', 'Other'].map((b) => ({ value: b }));
const CONTACT_TYPE_OPTIONS = [
  { value: 'INFLUENCER', label: 'Influencer' },
  { value: 'PROMOTER', label: 'School Promoter' },
];

const rupee = {
  formatter: (v) => (v ? `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : ''),
  parser: (v) => (v || '').replace(/,/g, ''),
  prefix: '₹',
  min: 0,
};

// Modal to create a new lead or edit an existing one.
export default function LeadFormModal({ open, onClose, onSaved, lead, funnels, users }) {
  const [form] = Form.useForm();
  const { user } = useAuth();
  const { message } = App.useApp();
  const { orderedIds, stageName } = useConfig();
  const isEdit = !!lead;
  const stageOptions = orderedIds.map((id) => ({ value: id, label: stageName(id) }));

  // A funnel-scoped user may only file leads under funnels they can access.
  const myFunnelIds = user?.funnelIds || [];
  const funnelOptions = (funnels || []).filter((f) => !myFunnelIds.length || myFunnelIds.includes(f.id));

  useEffect(() => {
    if (!open) return;
    if (lead) {
      form.setFieldsValue({
        schoolName: lead.schoolName,
        board: lead.board,
        studentStrength: lead.studentStrength,
        region: lead.region,
        location: lead.location,
        contactName: lead.contactName,
        contactType: lead.contactType,
        contactPhone: lead.contactPhone,
        totalContractValue: lead.totalContractValue,
        pspmRate: lead.pspmRate,
        cac: lead.cac,
        leadDate: lead.leadDate ? dayjs(lead.leadDate) : undefined,
        reminderAt: lead.reminderAt ? dayjs(lead.reminderAt) : null,
        reminderNote: lead.reminderNote,
        stage: lead.stage,
        funnelId: lead.funnelId,
        ownerId: lead.ownerId,
      });
    } else {
      form.resetFields();
      form.setFieldsValue({
        stage: orderedIds[0],
        leadDate: dayjs(),
        funnelId: funnelOptions.length === 1 ? funnelOptions[0].id : undefined,
      });
    }
  }, [open, lead, form]);

  const submit = async () => {
    let values;
    try {
      values = await form.validateFields();
    } catch (e) {
      return;
    }
    const payload = {
      ...values,
      leadDate: values.leadDate ? values.leadDate.toISOString() : undefined,
      reminderAt: values.reminderAt ? values.reminderAt.toISOString() : null,
    };
    try {
      if (isEdit) {
        await api.put(`/leads/${lead.id}`, payload);
        message.success('Lead updated');
      } else {
        await api.post('/leads', payload);
        message.success('Lead created');
      }
      onSaved();
      onClose();
    } catch (e) {
      message.error(e.response?.data?.error || 'Save failed');
    }
  };

  return (
    <Modal
      open={open}
      title={isEdit ? 'Edit lead' : 'Add lead'}
      onOk={submit}
      onCancel={onClose}
      okText={isEdit ? 'Save' : 'Create'}
      width={680}
      destroyOnHidden
    >
      <Form form={form} layout="vertical">
        <Form.Item name="schoolName" label="School name" rules={[{ required: true, message: 'School name is required' }]}>
          <Input placeholder="e.g. Delhi Public School" />
        </Form.Item>
        <div style={{ display: 'flex', gap: 12 }}>
          <Form.Item name="board" label="School board" style={{ flex: 1 }}>
            <AutoComplete options={BOARD_OPTIONS} placeholder="CBSE / ICSE / ..." allowClear filterOption />
          </Form.Item>
          <Form.Item name="studentStrength" label="Student strength" style={{ flex: 1 }} rules={[{ required: true, message: 'Required' }]}>
            <InputNumber min={0} style={{ width: '100%' }} placeholder="e.g. 1200" />
          </Form.Item>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <Form.Item name="region" label="Region" style={{ flex: 1 }}>
            <Input placeholder="e.g. North" />
          </Form.Item>
          <Form.Item name="location" label="Location / City" style={{ flex: 1 }}>
            <Input placeholder="e.g. New Delhi" />
          </Form.Item>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <Form.Item name="contactName" label="Contact name" style={{ flex: 1 }} rules={[{ required: true, message: 'Required' }]}>
            <Input placeholder="Person at the school" />
          </Form.Item>
          <Form.Item name="contactType" label="Contact type" style={{ flex: 1 }}>
            <Select options={CONTACT_TYPE_OPTIONS} allowClear placeholder="Influencer / Promoter" />
          </Form.Item>
          <Form.Item name="contactPhone" label="Contact phone" style={{ flex: 1 }}>
            <Input placeholder="Phone number" />
          </Form.Item>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <Form.Item name="totalContractValue" label="Total Contract Value" style={{ flex: 1 }} rules={[{ required: true, message: 'Required' }]}>
            <InputNumber {...rupee} style={{ width: '100%' }} placeholder="e.g. 500000" />
          </Form.Item>
          <Form.Item name="pspmRate" label="PSPM Rate" style={{ flex: 1 }} tooltip="Per Student Per Month rate (₹)">
            <InputNumber {...rupee} style={{ width: '100%' }} placeholder="e.g. 250" />
          </Form.Item>
          <Form.Item name="cac" label="CAC" style={{ flex: 1 }} tooltip="Cost of Customer Acquisition (₹). Entered manually for now; a future Zoho Expense hook can fill this automatically.">
            <InputNumber {...rupee} style={{ width: '100%' }} placeholder="e.g. 15000" />
          </Form.Item>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <Form.Item name="leadDate" label="Lead date" style={{ flex: 1 }} tooltip="Used to compute lead ageing">
            <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" />
          </Form.Item>
          <Form.Item name="reminderAt" label="Reminder date" style={{ flex: 1 }} tooltip="Lead is flagged in the pool when this date arrives">
            <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" />
          </Form.Item>
        </div>
        <Form.Item name="reminderNote" label="Reminder note">
          <Input placeholder="What to follow up on" />
        </Form.Item>
        <div style={{ display: 'flex', gap: 12 }}>
          <Form.Item name="funnelId" label="Funnel" style={{ flex: 1 }} rules={[{ required: true, message: 'Required' }]}>
            <Select
              placeholder="Assign to a funnel"
              options={funnelOptions.map((f) => ({ value: f.id, label: f.name }))}
            />
          </Form.Item>
          {!isEdit && (
            <Form.Item name="stage" label="Initial stage" style={{ flex: 1 }}>
              <Select options={stageOptions} />
            </Form.Item>
          )}
          {canManageData(user) && (
            <Form.Item name="ownerId" label="Owner (sales rep)" style={{ flex: 1 }}>
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                placeholder="Assign owner"
                options={(users || []).map((u) => ({ value: u.id, label: `${u.name}` }))}
              />
            </Form.Item>
          )}
        </div>
      </Form>
    </Modal>
  );
}
