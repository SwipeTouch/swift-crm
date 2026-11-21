import { useEffect, useState } from 'react';
import { Modal, Form, Input, InputNumber, Select, AutoComplete, DatePicker, Button, Divider, Grid, App, Typography, theme } from 'antd';
import dayjs from 'dayjs';
import api from '../api';
import { canManageData, useAuth } from '../auth';
import { useConfig } from '../config';
import ClosureReviewModal from './ClosureReviewModal';

const { Text } = Typography;

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
  const { token } = theme.useToken();
  const { orderedIds, stageName, stageIndex, nextStageId, readOnly, repsReadOnly } = useConfig();
  const screens = Grid.useBreakpoint();
  const phone = screens.md === false;
  const row = { display: 'flex', gap: 12, flexDirection: phone ? 'column' : 'row' };
  const field = { flex: phone ? 'none' : 1, width: phone ? '100%' : undefined };
  const isEdit = !!lead;
  const isRep = user?.role === 'SALES_REP';
  const canWrite = user?.role === 'SUPER_ADMIN' || (!readOnly && !(repsReadOnly && isRep) && !user?.locked);
  const stageLocked = isEdit && lead.stage === 'closure' && user?.role !== 'SUPER_ADMIN';
  const [notes, setNotes] = useState([]);
  const [remark, setRemark] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [reviewLead, setReviewLead] = useState(null);

  // A funnel-scoped user may only file leads under funnels they can access.
  const myFunnelIds = user?.funnelIds || [];
  const funnelOptions = (funnels || []).filter((f) => !myFunnelIds.length || myFunnelIds.includes(f.id));
  const stageOptions = orderedIds
    .filter((id) => {
      if (!isEdit) return true;
      if (id === lead.stage) return true;
      if (stageLocked) return false;
      if (id === 'not-interested') return true;
      if (canManageData(user)) return true;
      return stageIndex(id) > stageIndex(lead.stage);
    })
    .map((id) => ({ value: id, label: stageName(id) }));

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
      setRemark('');
      api.get(`/leads/${lead.id}`)
        .then((r) => setNotes(r.data.lead.notes || []))
        .catch(() => setNotes([]));
    } else {
      form.resetFields();
      setNotes([]);
      setRemark('');
      form.setFieldsValue({
        stage: orderedIds[0],
        leadDate: dayjs(),
        funnelId: funnelOptions.length === 1 ? funnelOptions[0].id : undefined,
      });
    }
  }, [open, lead, form]);

  const notesByDay = [];
  for (const n of notes) {
    const key = dayjs(n.createdAt).format('YYYY-MM-DD');
    const last = notesByDay[notesByDay.length - 1];
    if (!last || last.key !== key) {
      notesByDay.push({ key, label: dayjs(n.createdAt).format('DD MMM YYYY'), items: [n] });
    } else {
      last.items.push(n);
    }
  }
  notesByDay.reverse();

  const addNote = async () => {
    const body = remark.trim();
    if (!lead || !body) return message.warning('Write a note first');
    setSavingNote(true);
    try {
      const r = await api.post(`/leads/${lead.id}/notes`, { body });
      setNotes((prev) => [...prev, r.data.note]);
      setRemark('');
      message.success('Note added');
      onSaved && onSaved();
    } catch (e) {
      message.error(e.response?.data?.error || 'Could not add the note');
    } finally {
      setSavingNote(false);
    }
  };

  const submit = async () => {
    let values;
    try {
      values = await form.validateFields();
    } catch (e) {
      return;
    }
    const { stage, ...fields } = values;
    const payload = {
      ...fields,
      leadDate: values.leadDate ? values.leadDate.toISOString() : undefined,
      reminderAt: values.reminderAt ? values.reminderAt.toISOString() : null,
    };
    try {
      if (isEdit) {
        await api.put(`/leads/${lead.id}`, payload);
        if (remark.trim()) {
          const saved = await api.post(`/leads/${lead.id}/notes`, { body: remark.trim() });
          setNotes((prev) => [...prev, saved.data.note]);
          setRemark('');
        }
        const stageChanged = stage && stage !== lead.stage;
        if (stageChanged && stage === 'closure' && nextStageId(lead.stage) === 'closure') {
          message.success('Lead updated. Confirm the deal to move it to Closure.');
          onSaved && onSaved();
          setReviewLead({ ...lead, ...fields, stage: lead.stage });
          return;
        }
        if (stageChanged) {
          await api.post(`/leads/${lead.id}/stage`, { toStage: stage });
        }
        message.success('Lead updated');
      } else {
        await api.post('/leads', { ...payload, stage });
        message.success('Lead created');
      }
      onSaved();
      onClose();
    } catch (e) {
      message.error(e.response?.data?.error || 'Save failed');
    }
  };

  return (
    <>
      <Modal
        open={open}
        title={isEdit ? 'Edit lead' : 'Add lead'}
        onOk={submit}
        onCancel={onClose}
        okText={isEdit ? 'Save' : 'Create'}
        okButtonProps={{ disabled: !canWrite }}
        width={phone ? 'calc(100vw - 16px)' : 680}
        style={{ top: phone ? 12 : undefined, maxWidth: 'calc(100vw - 16px)' }}
        styles={{ body: { maxHeight: phone ? '70vh' : '75vh', overflow: 'auto' } }}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" disabled={!canWrite}>
          <Form.Item name="schoolName" label="School name" rules={[{ required: true, message: 'School name is required' }]}>
            <Input placeholder="e.g. Delhi Public School" />
          </Form.Item>
          <div style={row}>
            <Form.Item name="board" label="School board" style={field}>
              <AutoComplete options={BOARD_OPTIONS} placeholder="CBSE / ICSE / ..." allowClear filterOption />
            </Form.Item>
            <Form.Item name="studentStrength" label="Student strength" style={field} rules={[{ required: true, message: 'Required' }]}>
              <InputNumber min={0} style={{ width: '100%' }} placeholder="e.g. 1200" />
            </Form.Item>
          </div>
          <div style={row}>
            <Form.Item name="region" label="Region" style={field}>
              <Input placeholder="e.g. North" />
            </Form.Item>
            <Form.Item name="location" label="Location / City" style={field}>
              <Input placeholder="e.g. New Delhi" />
            </Form.Item>
          </div>
          <div style={row}>
            <Form.Item name="contactName" label="Contact name" style={field} rules={[{ required: true, message: 'Required' }]}>
              <Input placeholder="Person at the school" />
            </Form.Item>
            <Form.Item name="contactType" label="Contact type" style={field}>
              <Select options={CONTACT_TYPE_OPTIONS} allowClear placeholder="Influencer / Promoter" />
            </Form.Item>
            <Form.Item name="contactPhone" label="Contact phone" style={field}>
              <Input placeholder="Phone number" />
            </Form.Item>
          </div>
          <div style={row}>
            <Form.Item name="totalContractValue" label="Total Contract Value" style={field} rules={[{ required: true, message: 'Required' }]}>
              <InputNumber {...rupee} style={{ width: '100%' }} placeholder="e.g. 500000" />
            </Form.Item>
            <Form.Item name="pspmRate" label="PSPM Rate" style={field} tooltip="Per Student Per Month rate (₹)">
              <InputNumber {...rupee} style={{ width: '100%' }} placeholder="e.g. 250" />
            </Form.Item>
            <Form.Item name="cac" label="CAC" style={field} tooltip="Cost of Customer Acquisition (₹). Entered manually for now; a future Zoho Expense hook can fill this automatically.">
              <InputNumber {...rupee} style={{ width: '100%' }} placeholder="e.g. 15000" />
            </Form.Item>
          </div>
          <div style={row}>
            <Form.Item name="leadDate" label="Lead date" style={field} tooltip="Used to compute lead ageing">
              <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" />
            </Form.Item>
            <Form.Item name="reminderAt" label="Reminder date" style={field} tooltip="Lead is flagged in the pool when this date arrives">
              <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" />
            </Form.Item>
          </div>
          <Form.Item name="reminderNote" label="Reminder note">
            <Input placeholder="What to follow up on" />
          </Form.Item>
          <div style={row}>
            <Form.Item name="funnelId" label="Funnel" style={field} rules={[{ required: true, message: 'Required' }]}>
              <Select
                placeholder="Assign to a funnel"
                options={funnelOptions.map((f) => ({ value: f.id, label: f.name }))}
              />
            </Form.Item>
            <Form.Item name="stage" label={isEdit ? 'Stage' : 'Initial stage'} style={field}>
              <Select options={stageOptions} disabled={!canWrite || stageLocked} />
            </Form.Item>
            {canManageData(user) && (
              <Form.Item name="ownerId" label="Owner (sales rep)" style={field}>
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

        {isEdit && (
          <>
            <Divider>Notes</Divider>
            <div style={{ maxHeight: 220, overflow: 'auto', marginBottom: 12 }}>
              {notesByDay.length === 0 && <Text type="secondary">Nothing logged yet.</Text>}
              {notesByDay.map((day) => (
                <div key={day.key} style={{ marginBottom: 12 }}>
                  <Text strong>{day.label}</Text>
                  {day.items.map((n) => (
                    <div
                      key={n.id}
                      style={{ marginTop: 8, paddingLeft: 10, borderLeft: `2px solid ${token.colorBorderSecondary}` }}
                    >
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {dayjs(n.createdAt).format('h:mm A')} · {n.author?.name || 'Someone'}
                      </Text>
                      <div style={{ whiteSpace: 'pre-wrap' }}>{n.body}</div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
            {canWrite && (
              <div>
                <Input.TextArea
                  rows={3}
                  value={remark}
                  maxLength={4000}
                  placeholder="What happened today? A call, a visit, what they asked for."
                  onChange={(e) => setRemark(e.target.value)}
                />
                <Button type="primary" size="small" style={{ marginTop: 8 }} loading={savingNote} onClick={addNote}>
                  Add note
                </Button>
              </div>
            )}
          </>
        )}
      </Modal>
      <ClosureReviewModal
        lead={reviewLead}
        open={!!reviewLead}
        onClose={() => setReviewLead(null)}
        onDone={() => {
          setReviewLead(null);
          onSaved && onSaved();
          onClose();
        }}
      />
    </>
  );
}
