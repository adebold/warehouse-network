const { gql } = require('apollo-server-express');
const userResolvers = require('./resolvers/userResolvers');
const apiResolvers = require('./resolvers/apiResolvers');
const webhookResolvers = require('./resolvers/webhookResolvers');
const analyticsResolvers = require('./resolvers/analyticsResolvers');

// Type definitions
const typeDefs = gql\`
  scalar DateTime
  scalar JSON

  type Query {
    # User queries
    me: User
    users(limit: Int, offset: Int, search: String): UserConnection
    user(id: ID!): User

    # API queries
    apis(limit: Int, offset: Int, search: String): APIConnection
    api(id: ID!): API
    apiVersions(apiId: ID!): [APIVersion]
    apiMetrics(apiId: ID!, timeRange: String): APIMetrics

    # Webhook queries
    webhooks(limit: Int, offset: Int): WebhookConnection
    webhook(id: ID!): Webhook
    webhookLogs(webhookId: ID!, limit: Int): [WebhookLog]

    # Analytics queries
    dashboardMetrics(timeRange: String): DashboardMetrics
    apiUsageStats(apiId: ID, timeRange: String): APIUsageStats
    rateLimitStats(timeRange: String): RateLimitStats
  }

  type Mutation {
    # Authentication mutations
    register(input: RegisterInput!): AuthPayload
    login(input: LoginInput!): AuthPayload
    refreshToken(token: String!): AuthPayload
    logout: Boolean
    forgotPassword(email: String!): Boolean
    resetPassword(input: ResetPasswordInput!): Boolean

    # User mutations
    updateProfile(input: UpdateProfileInput!): User
    changePassword(input: ChangePasswordInput!): Boolean
    generateApiKey(input: ApiKeyInput!): ApiKey
    revokeApiKey(id: ID!): Boolean

    # API mutations
    createAPI(input: CreateAPIInput!): API
    updateAPI(id: ID!, input: UpdateAPIInput!): API
    deleteAPI(id: ID!): Boolean
    createAPIVersion(input: CreateAPIVersionInput!): APIVersion
    publishAPIVersion(id: ID!): APIVersion

    # Webhook mutations
    createWebhook(input: CreateWebhookInput!): Webhook
    updateWebhook(id: ID!, input: UpdateWebhookInput!): Webhook
    deleteWebhook(id: ID!): Boolean
    testWebhook(id: ID!): WebhookTestResult
  }

  type Subscription {
    # Real-time updates
    apiMetricsUpdated(apiId: ID!): APIMetrics
    webhookDelivered(webhookId: ID!): WebhookLog
    rateLimitAlerts: RateLimitAlert
  }

  # User types
  type User {
    id: ID!
    email: String!
    firstName: String!
    lastName: String!
    fullName: String!
    organization: String
    role: UserRole!
    tier: UserTier!
    status: UserStatus!
    emailVerified: Boolean!
    lastLogin: DateTime
    preferences: UserPreferences
    apiKeys: [ApiKey]
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type UserConnection {
    nodes: [User]
    totalCount: Int!
    pageInfo: PageInfo!
  }

  type UserPreferences {
    notifications: NotificationPreferences
    dashboard: DashboardPreferences
  }

  type NotificationPreferences {
    email: Boolean!
    webhook: Boolean!
    sms: Boolean!
  }

  type DashboardPreferences {
    theme: String!
    timezone: String!
    language: String!
  }

  enum UserRole {
    USER
    ADMIN
    DEVELOPER
    VIEWER
  }

  enum UserTier {
    FREE
    BASIC
    PREMIUM
    ENTERPRISE
  }

  enum UserStatus {
    ACTIVE
    INACTIVE
    SUSPENDED
    PENDING
  }

  # API types
  type API {
    id: ID!
    name: String!
    description: String
    baseUrl: String!
    category: String
    status: APIStatus!
    versions: [APIVersion]
    currentVersion: APIVersion
    documentation: APIDocumentation
    authentication: APIAuthentication
    rateLimit: APIRateLimit
    tags: [String]
    owner: User!
    collaborators: [User]
    metrics: APIMetrics
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type APIConnection {
    nodes: [API]
    totalCount: Int!
    pageInfo: PageInfo!
  }

  type APIVersion {
    id: ID!
    version: String!
    api: API!
    changelog: String
    schema: JSON
    endpoints: [APIEndpoint]
    status: VersionStatus!
    publishedAt: DateTime
    deprecatedAt: DateTime
    createdAt: DateTime!
  }

  type APIEndpoint {
    id: ID!
    path: String!
    method: HTTPMethod!
    description: String
    parameters: [APIParameter]
    responses: [APIResponse]
    authentication: Boolean!
  }

  type APIParameter {
    name: String!
    type: String!
    required: Boolean!
    description: String
    example: String
  }

  type APIResponse {
    statusCode: Int!
    description: String
    schema: JSON
    example: JSON
  }

  type APIDocumentation {
    content: String
    format: DocumentationFormat!
    lastUpdated: DateTime
  }

  type APIAuthentication {
    type: AuthenticationType!
    config: JSON
  }

  type APIRateLimit {
    requests: Int!
    window: Int!
    burst: Int
  }

  type APIMetrics {
    totalRequests: Int!
    successfulRequests: Int!
    failedRequests: Int!
    averageResponseTime: Float!
    p95ResponseTime: Float!
    errorRate: Float!
    uptime: Float!
    lastUpdated: DateTime!
  }

  enum APIStatus {
    DRAFT
    PUBLISHED
    DEPRECATED
    ARCHIVED
  }

  enum VersionStatus {
    DRAFT
    PUBLISHED
    DEPRECATED
  }

  enum HTTPMethod {
    GET
    POST
    PUT
    DELETE
    PATCH
    OPTIONS
    HEAD
  }

  enum DocumentationFormat {
    MARKDOWN
    HTML
    OPENAPI
  }

  enum AuthenticationType {
    NONE
    API_KEY
    BEARER_TOKEN
    OAUTH2
    BASIC_AUTH
  }

  # Webhook types
  type Webhook {
    id: ID!
    name: String!
    url: String!
    events: [String!]!
    active: Boolean!
    secret: String
    headers: JSON
    retryPolicy: WebhookRetryPolicy
    owner: User!
    logs: [WebhookLog]
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type WebhookConnection {
    nodes: [Webhook]
    totalCount: Int!
    pageInfo: PageInfo!
  }

  type WebhookLog {
    id: ID!
    webhook: Webhook!
    event: String!
    payload: JSON!
    response: WebhookResponse
    status: WebhookStatus!
    attempts: Int!
    createdAt: DateTime!
  }

  type WebhookResponse {
    statusCode: Int!
    headers: JSON
    body: String
    duration: Int!
  }

  type WebhookRetryPolicy {
    maxAttempts: Int!
    backoffMultiplier: Float!
    maxDelay: Int!
  }

  type WebhookTestResult {
    success: Boolean!
    statusCode: Int
    response: String
    error: String
  }

  enum WebhookStatus {
    PENDING
    SUCCESS
    FAILED
    RETRYING
  }

  # Analytics types
  type DashboardMetrics {
    totalAPIs: Int!
    totalRequests: Int!
    totalWebhooks: Int!
    activeUsers: Int!
    requestsToday: Int!
    requestsThisWeek: Int!
    requestsThisMonth: Int!
    topAPIs: [APIUsageStat]
    recentActivity: [ActivityLog]
  }

  type APIUsageStats {
    api: API
    requestCount: Int!
    uniqueUsers: Int!
    averageResponseTime: Float!
    errorRate: Float!
    timeSeriesData: [TimeSeriesPoint]
  }

  type TimeSeriesPoint {
    timestamp: DateTime!
    value: Float!
    metadata: JSON
  }

  type APIUsageStat {
    api: API!
    requestCount: Int!
    uniqueUsers: Int!
  }

  type ActivityLog {
    id: ID!
    action: String!
    resource: String!
    user: User
    timestamp: DateTime!
    metadata: JSON
  }

  type RateLimitStats {
    totalRequests: Int!
    limitExceededCount: Int!
    topLimitedEndpoints: [EndpointLimitStat]
  }

  type EndpointLimitStat {
    endpoint: String!
    limitExceededCount: Int!
  }

  type RateLimitAlert {
    endpoint: String!
    userId: ID
    threshold: Float!
    current: Float!
    timestamp: DateTime!
  }

  # Input types
  input RegisterInput {
    email: String!
    password: String!
    firstName: String!
    lastName: String!
    organization: String
  }

  input LoginInput {
    email: String!
    password: String!
    rememberMe: Boolean = false
  }

  input ResetPasswordInput {
    token: String!
    password: String!
  }

  input UpdateProfileInput {
    firstName: String
    lastName: String
    organization: String
    preferences: UserPreferencesInput
  }

  input UserPreferencesInput {
    notifications: NotificationPreferencesInput
    dashboard: DashboardPreferencesInput
  }

  input NotificationPreferencesInput {
    email: Boolean
    webhook: Boolean
    sms: Boolean
  }

  input DashboardPreferencesInput {
    theme: String
    timezone: String
    language: String
  }

  input ChangePasswordInput {
    currentPassword: String!
    newPassword: String!
  }

  input ApiKeyInput {
    name: String!
    permissions: [String!]
    expiresAt: DateTime
  }

  input CreateAPIInput {
    name: String!
    description: String
    baseUrl: String!
    category: String
    tags: [String!]
    authentication: APIAuthenticationInput
    rateLimit: APIRateLimitInput
  }

  input UpdateAPIInput {
    name: String
    description: String
    baseUrl: String
    category: String
    tags: [String!]
    status: APIStatus
    authentication: APIAuthenticationInput
    rateLimit: APIRateLimitInput
  }

  input APIAuthenticationInput {
    type: AuthenticationType!
    config: JSON
  }

  input APIRateLimitInput {
    requests: Int!
    window: Int!
    burst: Int
  }

  input CreateAPIVersionInput {
    apiId: ID!
    version: String!
    changelog: String
    schema: JSON
  }

  input CreateWebhookInput {
    name: String!
    url: String!
    events: [String!]!
    secret: String
    headers: JSON
    retryPolicy: WebhookRetryPolicyInput
  }

  input UpdateWebhookInput {
    name: String
    url: String
    events: [String!]
    active: Boolean
    secret: String
    headers: JSON
    retryPolicy: WebhookRetryPolicyInput
  }

  input WebhookRetryPolicyInput {
    maxAttempts: Int!
    backoffMultiplier: Float!
    maxDelay: Int!
  }

  # Common types
  type AuthPayload {
    user: User!
    accessToken: String!
    refreshToken: String!
    expiresIn: Int!
  }

  type ApiKey {
    id: ID!
    name: String!
    key: String!
    permissions: [String!]!
    lastUsed: DateTime
    expiresAt: DateTime
    createdAt: DateTime!
    active: Boolean!
  }

  type PageInfo {
    hasNextPage: Boolean!
    hasPreviousPage: Boolean!
    startCursor: String
    endCursor: String
  }
\`;

// Combine all resolvers
const resolvers = {
  Query: {
    ...userResolvers.Query,
    ...apiResolvers.Query,
    ...webhookResolvers.Query,
    ...analyticsResolvers.Query,
  },
  Mutation: {
    ...userResolvers.Mutation,
    ...apiResolvers.Mutation,
    ...webhookResolvers.Mutation,
  },
  Subscription: {
    ...analyticsResolvers.Subscription,
    ...webhookResolvers.Subscription,
  },
  // Custom scalars
  DateTime: require('graphql-iso-date').GraphQLDateTime,
  JSON: require('graphql-type-json'),
};

module.exports = {
  typeDefs,
  resolvers,
};