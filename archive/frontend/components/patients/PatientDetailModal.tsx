"use client"

import { Dialog, Transition } from "@headlessui/react";
import {
  ClipboardDocumentListIcon,
  XMarkIcon,
  UserGroupIcon,
  ChartBarIcon,
  ClockIcon,
  BeakerIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
} from "@heroicons/react/24/outline";
import { Fragment } from "react";

import type { PatientDetails } from "@/types/patient";

interface PatientDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  patient: PatientDetails;
}

function Badge({
  children,
  variant = "default",
}: {
  children: React.ReactNode;
  variant?: "default" | "success" | "warning" | "error";
}) {
  const colors = {
    default:
      "bg-light-secondary dark:bg-dark-secondary text-light-text-secondary dark:text-dark-text-secondary",
    success: "bg-accent-success/10 text-accent-success",
    warning: "bg-accent-warning/10 text-accent-warning",
    error: "bg-accent-error/10 text-accent-error",
  };

  return (
    <span
      className={`px-2 py-1 rounded-full text-xs font-medium ${colors[variant]}`}
    >
      {children}
    </span>
  );
}

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof InformationCircleIcon;
  children: React.ReactNode;
}) {
  return (
    <div className="panel-detail p-4">
      <div className="flex items-center space-x-2 mb-3">
        <Icon className="h-5 w-5 text-light-text-secondary dark:text-dark-text-secondary" />
        <h3 className="text-sm font-medium text-light-text-primary dark:text-dark-text-primary">
          {title}
        </h3>
      </div>
      <div>{children}</div>
    </div>
  );
}

export default function PatientDetailModal({
  isOpen,
  onClose,
  patient,
}: PatientDetailModalProps) {
  return (
    <Transition.Root as={Fragment} show={isOpen}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 modal-backdrop" />
        </Transition.Child>

        <div className="fixed inset-0 z-10 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
              enterTo="opacity-100 translate-y-0 sm:scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 translate-y-0 sm:scale-100"
              leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
            >
              <Dialog.Panel className="modal-container w-full max-w-4xl">
                {/* Header */}
                <div className="mb-6 flex items-start justify-between">
                  <div>
                    <Dialog.Title className="text-2xl font-semibold text-light-text-primary dark:text-dark-text-primary">
                      {`${patient.name.first} ${patient.name.last}`}
                    </Dialog.Title>
                    <div className="mt-1 text-light-text-secondary dark:text-dark-text-secondary">
                      <div className="flex items-center space-x-4">
                        <div>Age: {patient.demographics.age}</div>
                        <div>Gender: {patient.demographics.gender}</div>
                        <div>Language: {patient.demographics.language}</div>
                      </div>
                      <div className="flex items-center space-x-4 mt-1">
                        <div>Phone: {patient.demographics.phone}</div>
                        <div>Email: {patient.demographics.email}</div>
                        <div>
                          Address:{" "}
                          {patient.demographics.address
                            ? `${patient.demographics.address.street}, ${patient.demographics.address.city}, ${patient.demographics.address.state} ${patient.demographics.address.zip}`
                            : "Not provided"}
                        </div>
                      </div>
                    </div>
                  </div>
                  <button
                    className="rounded-lg p-1 text-light-text-secondary dark:text-dark-text-secondary hover:bg-light-secondary/80 dark:hover:bg-dark-secondary/80 transition-all duration-200"
                    onClick={onClose}
                  >
                    <XMarkIcon className="h-6 w-6" />
                  </button>
                </div>

                {/* Content */}
                <div className="space-y-4">
                  {/* Risk Factors */}
                  <Section icon={ExclamationTriangleIcon} title="Risk Factors">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
                            Risk Score
                          </div>
                          <div className="text-lg font-medium text-light-text-primary dark:text-dark-text-primary">
                            {patient.riskFactors.score}
                          </div>
                        </div>
                        <div>
                          <Badge
                            variant={
                              patient.riskFactors.level === "high"
                                ? "error"
                                : patient.riskFactors.level === "medium"
                                  ? "warning"
                                  : "success"
                            }
                          >
                            {patient.riskFactors.level} risk
                          </Badge>
                        </div>
                      </div>
                      <div>
                        <div className="text-sm font-medium mb-2 text-light-text-primary dark:text-dark-text-primary">
                          Contributing Factors
                        </div>
                        <div className="space-y-2">
                          {patient.riskFactors.factors.map((factor, index) => (
                            <div
                              key={index}
                              className="flex items-center justify-between p-2 bg-light-secondary/30 dark:bg-dark-secondary/30 rounded-lg"
                            >
                              <div className="text-light-text-primary dark:text-dark-text-primary">
                                {factor.name}
                              </div>
                              <div className="flex items-center space-x-4">
                                <div className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
                                  Last assessed: {factor.lastAssessed}
                                </div>
                                <Badge
                                  variant={
                                    factor.severity === "high"
                                      ? "error"
                                      : factor.severity === "medium"
                                        ? "warning"
                                        : "success"
                                  }
                                >
                                  {factor.severity}
                                </Badge>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </Section>

                  {/* Conditions */}
                  <Section icon={BeakerIcon} title="Active Conditions">
                    <div className="space-y-2">
                      {patient.conditions.map((condition) => (
                        <div
                          key={condition.id}
                          className="p-2 bg-light-secondary/30 dark:bg-dark-secondary/30 rounded-lg"
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="font-medium text-light-text-primary dark:text-dark-text-primary">
                                {condition.name}
                              </div>
                              <div className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
                                Diagnosed: {condition.diagnosedDate}
                              </div>
                            </div>
                            <div className="flex items-center space-x-4">
                              <Badge
                                variant={
                                  condition.controlStatus === "uncontrolled"
                                    ? "error"
                                    : condition.controlStatus === "controlled"
                                      ? "success"
                                      : "warning"
                                }
                              >
                                {condition.controlStatus}
                              </Badge>
                              <div className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
                                Last assessed: {condition.lastAssessed}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Section>

                  {/* Care Gaps */}
                  <Section icon={ClipboardDocumentListIcon} title="Care Gaps">
                    <div className="space-y-2">
                      {patient.careGaps.map((gap) => (
                        <div
                          key={gap.id}
                          className="p-2 bg-light-secondary/30 dark:bg-dark-secondary/30 rounded-lg"
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="font-medium text-light-text-primary dark:text-dark-text-primary">
                                {gap.measure}
                              </div>
                              <div className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
                                {gap.description}
                              </div>
                            </div>
                            <div className="flex items-center space-x-4">
                              <div className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
                                Due: {gap.dueDate}
                              </div>
                              <Badge
                                variant={
                                  gap.priority === "high"
                                    ? "error"
                                    : gap.priority === "medium"
                                      ? "warning"
                                      : "success"
                                }
                              >
                                {gap.priority}
                              </Badge>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Section>

                  {/* Labs */}
                  <Section icon={BeakerIcon} title="Recent Labs">
                    <div className="space-y-2">
                      {patient.labs.map((lab) => (
                        <div
                          key={lab.id}
                          className="p-2 bg-light-secondary/30 dark:bg-dark-secondary/30 rounded-lg"
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="font-medium text-light-text-primary dark:text-dark-text-primary">
                                {lab.name}
                              </div>
                              <div className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
                                {lab.value} {lab.unit} • {lab.date}
                              </div>
                            </div>
                            <div className="flex items-center space-x-4">
                              <Badge
                                variant={
                                  lab.status === "critical"
                                    ? "error"
                                    : lab.status === "abnormal"
                                      ? "warning"
                                      : "success"
                                }
                              >
                                {lab.status}
                              </Badge>
                              {lab.trend && (
                                <div className="flex items-center space-x-1">
                                  <ChartBarIcon
                                    className={`h-4 w-4 ${
                                      lab.trend === "up"
                                        ? "text-accent-error"
                                        : lab.trend === "down"
                                          ? "text-accent-success"
                                          : "text-light-text-secondary dark:text-dark-text-secondary"
                                    }`}
                                  />
                                  <span className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
                                    {lab.trend}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Section>

                  {/* Patient Activity */}
                  <Section icon={ClockIcon} title="Patient Activity">
                    <div className="space-y-4">
                      {/* Emergency/Urgent Care */}
                      {patient.encounters.some(
                        (e) => e.type === "Emergency Department",
                      ) && (
                        <div>
                          <div className="text-sm font-medium mb-2 text-accent-error">
                            Emergency/Urgent Care
                          </div>
                          <div className="space-y-2">
                            {patient.encounters
                              .filter((e) => e.type === "Emergency Department")
                              .map((encounter) => (
                                <div
                                  key={encounter.id}
                                  className="p-2 bg-accent-error/10 rounded-lg border border-accent-error/20"
                                >
                                  <div className="flex items-center justify-between">
                                    <div>
                                      <div className="font-medium text-light-text-primary dark:text-dark-text-primary">
                                        {encounter.provider}
                                      </div>
                                      <div className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
                                        {encounter.summary}
                                      </div>
                                    </div>
                                    <div className="flex items-center space-x-4">
                                      <div className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
                                        {encounter.date}
                                      </div>
                                      {encounter.followUpNeeded && (
                                        <Badge variant="warning">
                                          Follow-up: {encounter.followUpDate}
                                        </Badge>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              ))}
                          </div>
                        </div>
                      )}

                      {/* Specialty Care */}
                      {patient.encounters.some(
                        (e) =>
                          e.type !== "Emergency Department" &&
                          e.type !== "Office Visit",
                      ) && (
                        <div>
                          <div className="text-sm font-medium mb-2 text-accent-warning">
                            Specialty Care
                          </div>
                          <div className="space-y-2">
                            {patient.encounters
                              .filter(
                                (e) =>
                                  e.type !== "Emergency Department" &&
                                  e.type !== "Office Visit",
                              )
                              .map((encounter) => (
                                <div
                                  key={encounter.id}
                                  className="p-2 bg-accent-warning/10 rounded-lg border border-accent-warning/20"
                                >
                                  <div className="flex items-center justify-between">
                                    <div>
                                      <div className="font-medium text-light-text-primary dark:text-dark-text-primary">
                                        {encounter.type}
                                      </div>
                                      <div className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
                                        {encounter.provider} •{" "}
                                        {encounter.summary}
                                      </div>
                                    </div>
                                    <div className="flex items-center space-x-4">
                                      <div className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
                                        {encounter.date}
                                      </div>
                                      {encounter.followUpNeeded && (
                                        <Badge variant="warning">
                                          Follow-up: {encounter.followUpDate}
                                        </Badge>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              ))}
                          </div>
                        </div>
                      )}

                      {/* Recent Orders & Results */}
                      {patient.recentActions.length > 0 && (
                        <div>
                          <div className="text-sm font-medium mb-2 text-accent-success">
                            Completed Orders & Updates
                          </div>
                          <div className="space-y-2">
                            {patient.recentActions.map((action) => (
                              <div
                                key={action.id}
                                className="p-2 bg-accent-success/10 rounded-lg border border-accent-success/20"
                              >
                                <div className="flex items-center justify-between">
                                  <div>
                                    <div className="font-medium text-light-text-primary dark:text-dark-text-primary">
                                      {action.type}
                                    </div>
                                    <div className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
                                      {action.description} • {action.provider}
                                    </div>
                                  </div>
                                  <div className="flex items-center space-x-4">
                                    <div className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
                                      {action.date}
                                    </div>
                                    <Badge
                                      variant={
                                        action.priority === "high"
                                          ? "error"
                                          : "default"
                                      }
                                    >
                                      {action.priority}
                                    </Badge>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Critical Lab Results */}
                      {patient.labs.some(
                        (lab) => lab.status === "critical",
                      ) && (
                        <div>
                          <div className="text-sm font-medium mb-2 text-accent-error">
                            Critical Lab Results
                          </div>
                          <div className="space-y-2">
                            {patient.labs
                              .filter((lab) => lab.status === "critical")
                              .map((lab) => (
                                <div
                                  key={lab.id}
                                  className="p-2 bg-accent-error/10 rounded-lg border border-accent-error/20"
                                >
                                  <div className="flex items-center justify-between">
                                    <div>
                                      <div className="font-medium text-light-text-primary dark:text-dark-text-primary">
                                        {lab.name}
                                      </div>
                                      <div className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
                                        {lab.value} {lab.unit} • Reference:{" "}
                                        {lab.referenceRange}
                                      </div>
                                    </div>
                                    <div className="flex items-center space-x-4">
                                      <div className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
                                        {lab.date}
                                      </div>
                                      <div className="flex items-center space-x-1">
                                        <ChartBarIcon
                                          className={`h-4 w-4 ${
                                            lab.trend === "up"
                                              ? "text-accent-error"
                                              : lab.trend === "down"
                                                ? "text-accent-success"
                                                : "text-light-text-secondary dark:text-dark-text-secondary"
                                          }`}
                                        />
                                        <span className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
                                          {lab.trend}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </Section>

                  {/* Care Team */}
                  <Section icon={UserGroupIcon} title="Care Team">
                    <div className="space-y-2">
                      {patient.careTeam.map((member) => (
                        <div
                          key={member.id}
                          className="p-2 bg-light-secondary/30 dark:bg-dark-secondary/30 rounded-lg"
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="font-medium text-light-text-primary dark:text-dark-text-primary">
                                {member.name}
                              </div>
                              <div className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
                                {member.role}
                                {member.specialty && ` • ${member.specialty}`}
                              </div>
                            </div>
                            {member.primary && (
                              <Badge variant="success">Primary</Badge>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </Section>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition.Root>
  );
}
