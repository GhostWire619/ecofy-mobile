import { apiRequest } from '@/lib/api/client';

export type ConsultStatus =
  | 'queued'
  | 'assigned'
  | 'accepted'
  | 'in_review'
  | 'awaiting_farmer'
  | 'resolved'
  | 'cancelled';

export interface AdvisorProfile {
  id: string;
  user_id: string;
  verification_status: 'draft' | 'submitted' | 'under_review' | 'verified' | 'rejected' | 'suspended';
  professional_title?: string | null;
  license_number?: string | null;
  bio?: string | null;
  languages: string[];
  regions: string[];
  crop_specialties: string[];
  issue_specialties: string[];
  availability_status: string;
  average_rating?: number | null;
  consultations_completed: number;
  display_name?: string;
  location?: string | null;
  years_experience?: number | null;
  consultation_price?: number;
  currency?: string;
}

export interface ConsultObservation {
  id: string;
  category: string;
  description: string;
  image_urls: string[];
  severity: string;
  status: string;
  analysis: Record<string, unknown>;
  created_at: string;
}

export interface ConsultMessage {
  id: string;
  consult_id: string;
  sender_user_id: string;
  sender_name?: string | null;
  message_type: string;
  content: string;
  image_urls: string[];
  voice_url?: string | null;
  created_at: string;
}

export interface ExpertAssessment {
  id: string;
  decision: 'confirmed' | 'disagreed' | 'inconclusive' | 'healthy';
  diagnosis_key?: string | null;
  expert_confidence?: number | null;
  reasoning: string;
  endorses_engine_plan: boolean;
  generic_input_requirements: Record<string, unknown>[];
}

export interface ConsultTaskProposal {
  id: string;
  title: string;
  instructions: string[];
  task_type: string;
  priority: string;
  due_date?: string | null;
  status: string;
  accepted_task_id?: string | null;
}

export interface ExpertConsult {
  id: string;
  farmer_user_id: string;
  advisor_user_id?: string | null;
  observation_id: string;
  farm_id: string;
  journey_id?: string | null;
  plot_id?: string | null;
  status: ConsultStatus;
  priority: 'normal' | 'urgent';
  language: string;
  request_reason?: string | null;
  ai_confidence?: number | null;
  severity?: string | null;
  requested_at: string;
  farmer_name: string;
  advisor_name?: string | null;
  observation?: ConsultObservation | null;
  messages?: ConsultMessage[];
  assessment?: ExpertAssessment | null;
  task_proposals?: ConsultTaskProposal[];
}

type AdvisorProfileUpdate = Pick<AdvisorProfile,
  'professional_title' | 'license_number' | 'bio' | 'languages' | 'regions' |
  'crop_specialties' | 'issue_specialties' | 'availability_status'
>;

export const consultsApi = {
  createFromObservation(
    observationId: string,
    requestReason?: string,
    preferredAdvisorId?: string,
    initialMessage?: string,
  ) {
    return apiRequest<ExpertConsult>(`/api/observations/${observationId}/consults`, {
      method: 'POST',
      auth: true,
      body: JSON.stringify({
        request_reason: requestReason,
        preferred_advisor_id: preferredAdvisorId,
        initial_message: initialMessage,
      }),
    });
  },
  listAdvisors() {
    return apiRequest<AdvisorProfile[]>('/api/advisors', { method: 'GET', auth: true });
  },
  getAdvisorProfile() {
    return apiRequest<AdvisorProfile>('/api/advisors/me', { method: 'GET', auth: true });
  },
  updateAdvisorProfile(payload: Partial<AdvisorProfileUpdate>) {
    return apiRequest<AdvisorProfile>('/api/advisors/me', {
      method: 'PATCH', auth: true, body: JSON.stringify(payload),
    });
  },
  submitVerification() {
    return apiRequest<AdvisorProfile>('/api/advisors/me/submit-verification', { method: 'POST', auth: true });
  },
  listExpertConsults() {
    return apiRequest<ExpertConsult[]>('/api/advisors/me/consults', { method: 'GET', auth: true });
  },
  getExpertConsult(consultId: string) {
    return apiRequest<ExpertConsult>(`/api/advisors/me/consults/${consultId}`, { method: 'GET', auth: true });
  },
  listFarmerConsults() {
    return apiRequest<ExpertConsult[]>('/api/consults', { method: 'GET', auth: true });
  },
  getFarmerConsult(consultId: string) {
    return apiRequest<ExpertConsult>(`/api/consults/${consultId}`, { method: 'GET', auth: true });
  },
  accept(consultId: string) {
    return apiRequest<ExpertConsult>(`/api/advisors/me/consults/${consultId}/accept`, { method: 'POST', auth: true });
  },
  sendMessage(consultId: string, content: string) {
    return apiRequest<ConsultMessage>(`/api/consults/${consultId}/messages`, {
      method: 'POST', auth: true, body: JSON.stringify({ content, message_type: 'text', image_urls: [] }),
    });
  },
  submitAssessment(consultId: string, payload: {
    decision: ExpertAssessment['decision'];
    expert_confidence?: number;
    reasoning: string;
    endorses_engine_plan: boolean;
  }) {
    return apiRequest<ExpertAssessment>(`/api/advisors/me/consults/${consultId}/assessment`, {
      method: 'POST', auth: true, body: JSON.stringify({ ...payload, generic_input_requirements: [] }),
    });
  },
  createTaskProposal(consultId: string, payload: { title: string; instructions: string[] }) {
    return apiRequest<ConsultTaskProposal>(`/api/advisors/me/consults/${consultId}/task-proposals`, {
      method: 'POST', auth: true, body: JSON.stringify({ ...payload, task_type: 'expert_follow_up', priority: 'medium' }),
    });
  },
  acceptTaskProposal(consultId: string, proposalId: string) {
    return apiRequest<{ task_id: string }>(`/api/consults/${consultId}/proposals/${proposalId}/accept`, {
      method: 'POST', auth: true,
    });
  },
  resolve(consultId: string) {
    return apiRequest<ExpertConsult>(`/api/consults/${consultId}/resolve`, { method: 'POST', auth: true });
  },
};
