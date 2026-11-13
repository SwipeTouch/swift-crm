import { useEffect, useState } from 'react';
import { Modal, Radio, InputNumber, Alert, Descriptions, Space, Typography, Grid, Button, App } from 'antd';
import api from '../api';
import { inr } from '../format';
import { useConfig } from '../config';

const { Text, Paragraph } = Typography;

// Asks for the agreed commercial, then a final review, before Negotiation becomes Closure.
export default function ClosureReviewModal({ lead, open, note, onClose, onDone }) {
  const { message } = App.useApp();
  const { stageName } = useConfig();
  const screens = Grid.useBreakpoint();
  const phone = screens.md === false;
  const [step, setStep] = useState('details');
  const [valueType, setValueType] = useState('PSPM');
  const [pspmRate, setPspmRate] = useState();
  const [studentStrength, setStudentStrength] = useState();
  const [monthlyAmount, setMonthlyAmount] = useState();
  const [totalContractValue, setTotalContractValue] = useState();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !lead) return;
    const rate = lead.pspmRate || undefined;
    const students = lead.studentStrength || undefined;
    const monthly = rate && students ? rate * students : undefined;
    setStep('details');
    setValueType(rate ? 'PSPM' : 'MONTHLY');
    setPspmRate(rate);
    setStudentStrength(students);
    setMonthlyAmount(undefined);
    setTotalContractValue(lead.totalContractValue || (monthly ? monthly * 12 : undefined));
    setSaving(false);
  }, [open, lead]);

  const monthly = valueType === 'PSPM'
    ? (Number(pspmRate) || 0) * (Number(studentStrength) || 0)
    : (Number(monthlyAmount) || 0);

  const goReview = () => {
    if (valueType === 'PSPM' && (!(Number(pspmRate) > 0) || !(Number(studentStrength) > 0))) {
      return message.warning('Enter the per-student rate and the student strength');
    }
    if (valueType === 'MONTHLY' && !(Number(monthlyAmount) > 0)) {
      return message.warning('Enter the monthly amount');
    }
    if (!(Number(totalContractValue) > 0)) {
      setTotalContractValue(monthly > 0 ? monthly * 12 : undefined);
      if (!(monthly > 0)) return message.warning('Enter the total contract value');
    }
    setStep('review');
  };

  const confirm = async () => {
    if (!lead) return;
    setSaving(true);
    try {
      await api.post(`/leads/${lead.id}/stage`, {
        toStage: 'closure',
        note: note || undefined,
        sales: {
          valueType,
          pspmRate,
          studentStrength,
          monthlyAmount,
          totalContractValue: Number(totalContractValue) > 0 ? totalContractValue : monthly * 12,
        },
      });
      message.success(`${lead.schoolName} is now in Closure`);
      onDone && onDone();
      onClose();
    } catch (e) {
      message.error(e.response?.data?.error || 'Could not close this lead');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title={step === 'details' ? 'Sales details before Closure' : 'Review before Closure'}
      onCancel={onClose}
      width={phone ? 'calc(100vw - 16px)' : 560}
      style={{ top: phone ? 12 : undefined, maxWidth: 'calc(100vw - 16px)' }}
      destroyOnHidden
      footer={step === 'details' ? [
        <Button key="cancel" onClick={onClose}>Cancel</Button>,
        <Button key="review" type="primary" onClick={goReview}>Review</Button>,
      ] : [
        <Button key="back" onClick={() => setStep('details')}>Back</Button>,
        <Button key="close" type="primary" loading={saving} onClick={confirm}>Put in Closure</Button>,
      ]}
    >
      {lead && step === 'details' && (
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Paragraph style={{ marginBottom: 0 }}>
            <Text strong>{lead.schoolName}</Text> is moving from {stageName(lead.stage)} to {stageName('closure')}. Enter how the school will pay.
          </Paragraph>
          <Radio.Group value={valueType} onChange={(e) => setValueType(e.target.value)}>
            <Radio.Button value="PSPM">PSPM</Radio.Button>
            <Radio.Button value="MONTHLY">Monthly amount</Radio.Button>
          </Radio.Group>
          {valueType === 'PSPM' ? (
            <Space direction={phone ? 'vertical' : 'horizontal'} style={{ width: '100%' }} size="middle">
              <div style={{ flex: 1 }}>
                <div>Per student / month</div>
                <InputNumber min={0} value={pspmRate} onChange={setPspmRate} prefix="₹" style={{ width: '100%' }} placeholder="e.g. 250" />
              </div>
              <div style={{ flex: 1 }}>
                <div>Student strength</div>
                <InputNumber min={1} value={studentStrength} onChange={setStudentStrength} style={{ width: '100%' }} placeholder="e.g. 1200" />
              </div>
            </Space>
          ) : (
            <div>
              <div>Monthly amount</div>
              <InputNumber min={0} value={monthlyAmount} onChange={setMonthlyAmount} prefix="₹" style={{ width: '100%' }} placeholder="e.g. 150000" />
            </div>
          )}
          <div>
            <div>Monthly total</div>
            <Text strong>{monthly > 0 ? inr(monthly) : '—'}</Text>
          </div>
          <div>
            <div>Total contract value</div>
            <InputNumber min={0} value={totalContractValue} onChange={setTotalContractValue} prefix="₹" style={{ width: '100%' }} placeholder={monthly > 0 ? String(monthly * 12) : 'Contract value'} />
            <Text type="secondary">This is the figure counted toward the yearly target. A year of the monthly total is {monthly > 0 ? inr(monthly * 12) : '—'}.</Text>
          </div>
        </Space>
      )}
      {lead && step === 'review' && (
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label="School">{lead.schoolName}</Descriptions.Item>
            <Descriptions.Item label="Stage">{stageName(lead.stage)} → {stageName('closure')}</Descriptions.Item>
            <Descriptions.Item label="Deal">
              {valueType === 'PSPM'
                ? `${inr(pspmRate)} per student / month × ${studentStrength} students`
                : `${inr(monthlyAmount)} per month`}
            </Descriptions.Item>
            <Descriptions.Item label="Monthly total">{inr(monthly)}</Descriptions.Item>
            <Descriptions.Item label="Total contract value">{inr(Number(totalContractValue) > 0 ? totalContractValue : monthly * 12)}</Descriptions.Item>
          </Descriptions>
          <Alert
            type="warning"
            showIcon
            message="Once this lead is in Closure, it cannot be moved back."
            description="Only an Admin can revert it and change its stage."
          />
        </Space>
      )}
    </Modal>
  );
}
