"use client";

import type { CareList } from "@/services/mockCareListData";

import { useState, useEffect } from "react";
import {
  UserGroupIcon,
  ClipboardDocumentListIcon,
  ChartBarIcon,
  ClockIcon,
  PlusIcon,
  MagnifyingGlassIcon,
  FunnelIcon,
  XMarkIcon,
  CommandLineIcon,
} from "@heroicons/react/24/outline";

import { mockCareLists, mockPatientsList } from "@/services/mockCareListData";
import CareListDetails from "@/components/care-lists/CareListDetails";
import CreateListModal from "@/components/care-lists/CreateListModal";
import AdminLayout from "@/components/layout/AdminLayout";

interface StatCardProps {
  title: string;
  value: string | number;
  description: string;
  icon: typeof ChartBarIcon;
  trend?: {
    value: number;
    label: string;
  };
}

function StatCard({
  title,
  value,
  description,
  icon: Icon,
  trend,
}: StatCardProps) {
  return (
    <div className="bg-light-primary dark:bg-dark-primary rounded-lg border border-light-border dark:border-dark-border p-6 shadow-md">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-light-text-secondary dark:text-dark-text-secondary text-sm font-medium">
            {title}
          </p>
          <p className="mt-2 text-2xl font-semibold text-light-text-primary dark:text-dark-text-primary">
            {value}
          </p>
          {trend && (
            <p
              className={`mt-1 text-sm ${
                trend.value >= 0 ? "text-accent-success" : "text-accent-error"
              }`}
            >
              {trend.value >= 0 ? "↑" : "↓"} {Math.abs(trend.value)}%{" "}
              {trend.label}
            </p>
          )}
        </div>
        <div className="rounded-lg bg-accent-primary/10 p-3">
          <Icon className="h-6 w-6 text-accent-primary" />
        </div>
      </div>
      <p className="mt-4 text-sm text-light-text-secondary dark:text-dark-text-secondary">
        {description}
      </p>
    </div>
  );
}

function CareListCard({
  list,
  onSelect,
}: {
  list: CareList;
  onSelect: () => void;
}) {
  const patients = mockPatientsList.filter((p) =>
    list.patients.includes(p.id.toString()),
  );
  const highRiskCount = patients.filter(
    (p) => p.riskFactors.level === "high",
  ).length;
  const careGapsCount = patients.reduce((sum, p) => sum + p.careGaps.length, 0);

  return (
    <button
      className="w-full p-4 rounded-lg bg-light-secondary/50 dark:bg-dark-secondary/50 hover:bg-light-secondary dark:hover:bg-dark-secondary border border-light-border dark:border-dark-border transition-colors"
      onClick={onSelect}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center space-x-2">
            <h3 className="text-lg font-medium text-light-text-primary dark:text-dark-text-primary">
              {list.name}
            </h3>
            <span
              className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                list.type === "measure-based"
                  ? "bg-accent-primary/10 text-accent-primary"
                  : "bg-accent-success/10 text-accent-success"
              }`}
            >
              {list.type === "measure-based" ? "Measure Based" : "Manual"}
            </span>
          </div>
          <p className="mt-1 text-sm text-light-text-secondary dark:text-dark-text-secondary">
            {list.description}
          </p>
          <div className="mt-4 flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <UserGroupIcon className="h-4 w-4 text-light-text-secondary dark:text-dark-text-secondary" />
              <span className="text-sm text-light-text-primary dark:text-dark-text-primary">
                {patients.length} patients
              </span>
            </div>
            {highRiskCount > 0 && (
              <div className="flex items-center space-x-2">
                <ChartBarIcon className="h-4 w-4 text-accent-error" />
                <span className="text-sm text-light-text-primary dark:text-dark-text-primary">
                  {highRiskCount} high risk
                </span>
              </div>
            )}
            {careGapsCount > 0 && (
              <div className="flex items-center space-x-2">
                <ClockIcon className="h-4 w-4 text-accent-warning" />
                <span className="text-sm text-light-text-primary dark:text-dark-text-primary">
                  {careGapsCount} care gaps
                </span>
              </div>
            )}
          </div>
          <div className="mt-2 flex items-center space-x-2">
            {list.tags.map((tag) => (
              <span
                key={tag}
                className="px-2 py-0.5 rounded-full text-xs bg-light-secondary dark:bg-dark-secondary text-light-text-secondary dark:text-dark-text-secondary"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      </div>
    </button>
  );
}

export default function CareListsPage() {
  const [selectedList, setSelectedList] = useState<CareList | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filter, setFilter] = useState<"all" | "measure" | "manual">("all");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + K to focus search
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        const searchInput = document.getElementById("search-lists");

        if (searchInput) {
          searchInput.focus();
        }
      }
      // Cmd/Ctrl + N to create new list
      if ((e.metaKey || e.ctrlKey) && e.key === "n") {
        e.preventDefault();
        setIsCreateModalOpen(true);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleSelectList = (list: CareList) => {
    setSelectedList(list);
    setShowDetails(true);
  };

  const handleSearch = (value: string) => {
    setIsSearching(true);
    setSearchTerm(value);
    // Simulate search delay
    setTimeout(() => setIsSearching(false), 300);
  };

  const filteredLists = mockCareLists.filter((list) => {
    if (filter === "measure" && list.type !== "measure-based") return false;
    if (filter === "manual" && list.type !== "manual") return false;
    if (searchTerm) {
      const search = searchTerm.toLowerCase();

      return (
        list.name.toLowerCase().includes(search) ||
        list.description.toLowerCase().includes(search) ||
        list.tags.some((tag) => tag.toLowerCase().includes(search))
      );
    }

    return true;
  });

  const totalPatients = mockCareLists.reduce(
    (sum, list) => sum + list.patients.length,
    0,
  );

  const totalCareGaps = mockPatientsList
    .filter((p) =>
      mockCareLists.some((list) => list.patients.includes(p.id.toString())),
    )
    .reduce((sum, p) => sum + p.careGaps.length, 0);

  const highRiskPatients = mockPatientsList
    .filter((p) =>
      mockCareLists.some((list) => list.patients.includes(p.id.toString())),
    )
    .filter((p) => p.riskFactors.level === "high").length;

  return (
    <AdminLayout>
      <div className="h-full overflow-y-auto">
        <div className="space-y-6 p-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-semibold text-light-text-primary dark:text-dark-text-primary">
              Care Lists
            </h1>
            <button
              aria-label="Create new care list (⌘N)"
              className="flex items-center px-4 py-2 rounded-lg bg-accent-primary text-white hover:bg-accent-primary/90 focus:ring-2 focus:ring-accent-primary focus:ring-offset-2 dark:focus:ring-offset-dark-primary transition-all"
              onClick={() => setIsCreateModalOpen(true)}
            >
              <PlusIcon className="h-5 w-5 mr-2" />
              Create List
            </button>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              description="Patients in active care lists"
              icon={UserGroupIcon}
              title="Total Patients"
              trend={{
                value: 12.5,
                label: "vs last month",
              }}
              value={totalPatients}
            />
            <StatCard
              description="Patients requiring attention"
              icon={ChartBarIcon}
              title="High Risk"
              trend={{
                value: -5.2,
                label: "vs last month",
              }}
              value={highRiskPatients}
            />
            <StatCard
              description="Open care gaps"
              icon={ClockIcon}
              title="Care Gaps"
              trend={{
                value: -8.1,
                label: "vs last month",
              }}
              value={totalCareGaps}
            />
            <StatCard
              description="Care coordination lists"
              icon={ClipboardDocumentListIcon}
              title="Active Lists"
              value={mockCareLists.length}
            />
          </div>

          {/* Main Content Panel */}
          <div className="bg-light-primary dark:bg-dark-primary rounded-lg border border-light-border dark:border-dark-border p-6 shadow-md">
            {/* Search and Filters */}
            <div className="flex flex-col sm:flex-row gap-4 mb-6">
              <div className="flex-1">
                <div className="relative">
                  <div className="absolute left-3 top-1/2 transform -translate-y-1/2 flex items-center space-x-2">
                    <MagnifyingGlassIcon
                      className={`h-5 w-5 ${
                        isSearching
                          ? "text-accent-primary"
                          : "text-light-text-secondary dark:text-dark-text-secondary"
                      }`}
                    />
                    {!searchTerm && (
                      <kbd className="hidden sm:block px-1.5 py-0.5 text-xs text-light-text-secondary dark:text-dark-text-secondary bg-light-secondary dark:bg-dark-secondary rounded">
                        <CommandLineIcon className="h-3 w-3 inline mr-1" />K
                      </kbd>
                    )}
                  </div>
                  <input
                    className="input pl-10 pr-10 w-full bg-light-primary dark:bg-dark-primary text-light-text-primary dark:text-dark-text-primary border-light-border dark:border-dark-border focus:border-accent-primary focus:ring-accent-primary"
                    id="search-lists"
                    placeholder="Search lists..."
                    type="text"
                    value={searchTerm}
                    onChange={(e) => handleSearch(e.target.value)}
                  />
                  {searchTerm && (
                    <button
                      aria-label="Clear search"
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 p-1 rounded-full hover:bg-light-secondary dark:hover:bg-dark-secondary text-light-text-secondary dark:text-dark-text-secondary"
                      onClick={() => handleSearch("")}
                    >
                      <XMarkIcon className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
              <div className="flex gap-4">
                <button
                  className={`btn btn-secondary ${
                    filter !== "all"
                      ? "bg-accent-primary/10 text-accent-primary hover:bg-accent-primary/20"
                      : ""
                  }`}
                  onClick={() =>
                    setFilter(filter === "all" ? "measure" : "all")
                  }
                >
                  <FunnelIcon className="h-5 w-5 mr-2" />
                  Filters
                  {filter !== "all" && (
                    <span className="ml-2 px-1.5 py-0.5 text-xs rounded-full bg-accent-primary/20">
                      1
                    </span>
                  )}
                </button>
                <select
                  aria-label="Filter by list type"
                  className="input min-w-[150px] bg-light-primary dark:bg-dark-primary text-light-text-primary dark:text-dark-text-primary border-light-border dark:border-dark-border focus:border-accent-primary focus:ring-accent-primary"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value as any)}
                >
                  <option value="all">All Lists</option>
                  <option value="measure">Measure Based</option>
                  <option value="manual">Manual Lists</option>
                </select>
              </div>
            </div>

            {/* Care Lists Grid */}
            <div className="space-y-4">
              {filteredLists.map((list) => (
                <CareListCard
                  key={list.id}
                  list={list}
                  onSelect={() => handleSelectList(list)}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Care List Details Drawer */}
      {showDetails && selectedList && (
        <CareListDetails
          list={selectedList}
          onClose={() => setShowDetails(false)}
        />
      )}

      {/* Create List Modal */}
      <CreateListModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreateList={(data) => {
          // Here you would typically save to backend
          console.log("Creating list:", data);
          setIsCreateModalOpen(false);
        }}
      />
    </AdminLayout>
  );
}
