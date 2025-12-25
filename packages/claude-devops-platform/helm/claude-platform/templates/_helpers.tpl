{{/*
Expand the name of the chart.
*/}}
{{- define "claude-platform.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
If release name contains chart name it will be used as a full name.
*/}}
{{- define "claude-platform.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "claude-platform.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "claude-platform.labels" -}}
helm.sh/chart: {{ include "claude-platform.chart" . }}
{{ include "claude-platform.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "claude-platform.selectorLabels" -}}
app.kubernetes.io/name: {{ include "claude-platform.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "claude-platform.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "claude-platform.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Return the proper image name
*/}}
{{- define "claude-platform.image" -}}
{{- $registryName := .Values.image.registry -}}
{{- $repositoryName := .Values.image.repository -}}
{{- $tag := .Values.image.tag | default .Chart.AppVersion -}}
{{- if .Values.global }}
    {{- if .Values.global.imageRegistry }}
        {{- $registryName = .Values.global.imageRegistry -}}
    {{- end -}}
{{- end -}}
{{- if $registryName }}
{{- printf "%s/%s:%s" $registryName $repositoryName $tag -}}
{{- else -}}
{{- printf "%s:%s" $repositoryName $tag -}}
{{- end -}}
{{- end -}}

{{/*
Return the proper Docker Image Registry Secret Names
*/}}
{{- define "claude-platform.imagePullSecrets" -}}
{{- $pullSecrets := list -}}
{{- if .Values.global -}}
  {{- range .Values.global.imagePullSecrets -}}
    {{- $pullSecrets = append $pullSecrets . -}}
  {{- end -}}
{{- end -}}
{{- range .Values.image.pullSecrets -}}
  {{- $pullSecrets = append $pullSecrets . -}}
{{- end -}}
{{- if (not (empty $pullSecrets)) -}}
imagePullSecrets:
  {{- range $pullSecrets -}}
  - name: {{ . }}
  {{- end -}}
{{- end -}}
{{- end -}}

{{/*
Create the database URL
*/}}
{{- define "claude-platform.databaseUrl" -}}
{{- if .Values.postgresql.enabled }}
{{- $host := printf "%s-postgresql" (include "claude-platform.fullname" .) -}}
{{- $port := .Values.postgresql.service.port | default 5432 -}}
{{- $database := .Values.postgresql.auth.database -}}
{{- $username := .Values.postgresql.auth.username -}}
{{- printf "postgresql://%s:$(POSTGRES_PASSWORD)@%s:%d/%s?schema=public&sslmode=require" $username $host $port $database -}}
{{- else }}
{{- required "Database URL must be provided when PostgreSQL subchart is disabled" .Values.secrets.data.DATABASE_URL -}}
{{- end }}
{{- end }}

{{/*
Create the Redis URL
*/}}
{{- define "claude-platform.redisUrl" -}}
{{- if .Values.redis.enabled }}
{{- $host := printf "%s-redis-master" (include "claude-platform.fullname" .) -}}
{{- $port := .Values.redis.master.service.port | default 6379 -}}
{{- if .Values.redis.auth.enabled }}
{{- printf "redis://:$(REDIS_PASSWORD)@%s:%d" $host $port -}}
{{- else }}
{{- printf "redis://%s:%d" $host $port -}}
{{- end }}
{{- else }}
{{- required "Redis URL must be provided when Redis subchart is disabled" .Values.secrets.data.REDIS_URL -}}
{{- end }}
{{- end }}