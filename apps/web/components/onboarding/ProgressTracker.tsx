import { 
  CheckCircle, 
  Clock, 
  Play, 
  RotateCcw,
  Users,
  Building,
  Settings,
  TrendingUp
} from 'lucide-react';
import React from 'react';

import { useOnboarding } from './OnboardingProvider';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

interface ProgressTrackerProps {
  showResume?: boolean;
  showReset?: boolean;
  compact?: boolean;
}

export const ProgressTracker: React.FC<ProgressTrackerProps> = ({
  showResume = true,
  showReset = false,
  compact = false
}) => {
  const { flows, currentFlow, isOnboardingActive, startOnboarding, resetOnboarding } = useOnboarding();

  const getFlowIcon = (flowId: string) => {
    switch (flowId) {
      case 'customer':
        return Users;
      case 'operator':
        return Building;
      case 'admin':
        return Settings;
      default:
        return Users;
    }
  };

  const getFlowColor = (flowId: string, isComplete: boolean, isActive: boolean) => {
    if (isActive) {return 'border-primary bg-primary/5';}
    if (isComplete) {return 'border-green-500 bg-green-50 dark:bg-green-900/20';}
    
    switch (flowId) {
      case 'customer':
        return 'border-blue-200 bg-blue-50 dark:bg-blue-900/20';
      case 'operator':
        return 'border-green-200 bg-green-50 dark:bg-green-900/20';
      case 'admin':
        return 'border-purple-200 bg-purple-50 dark:bg-purple-900/20';
      default:
        return 'border-gray-200 bg-gray-50 dark:bg-gray-900/20';
    }
  };

  if (compact) {
    return (
      <div className="space-y-3">
        {Object.values(flows).map((flow) => {
          const Icon = getFlowIcon(flow.id);
          const isActive = currentFlow?.id === flow.id && isOnboardingActive;
          
          return (
            <Card key={flow.id} className={cn("border-2", getFlowColor(flow.id, flow.isComplete, isActive))}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center",
                      flow.isComplete ? "bg-green-100 dark:bg-green-900/30" : "bg-muted"
                    )}>
                      {flow.isComplete ? (
                        <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                      ) : (
                        <Icon className="h-4 w-4" />
                      )}
                    </div>
                    <div>
                      <h4 className="font-medium text-sm">{flow.name}</h4>
                      <div className="flex items-center gap-2">
                        <Progress value={flow.progress} className="w-20 h-1" />
                        <span className="text-xs text-muted-foreground">{flow.progress}%</span>
                      </div>
                    </div>
                  </div>
                  
                  {isActive && (
                    <Badge variant="secondary" className="text-xs">
                      Active
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <h3 className="text-lg font-semibold">Onboarding Progress</h3>
        <p className="text-sm text-muted-foreground">
          Track your progress through the platform setup
        </p>
      </div>

      {/* Flow Cards */}
      <div className="space-y-4">
        {Object.values(flows).map((flow) => {
          const Icon = getFlowIcon(flow.id);
          const isActive = currentFlow?.id === flow.id && isOnboardingActive;
          const completedSteps = flow.steps.filter(step => step.isComplete).length;
          const requiredSteps = flow.steps.filter(step => step.isRequired).length;
          const allRequiredComplete = flow.steps.filter(step => step.isRequired).every(step => step.isComplete);
          
          return (
            <Card 
              key={flow.id} 
              className={cn("border-2 transition-colors", getFlowColor(flow.id, flow.isComplete, isActive))}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className={cn(
                      "w-12 h-12 rounded-lg flex items-center justify-center",
                      flow.isComplete ? "bg-green-100 dark:bg-green-900/30" : "bg-muted"
                    )}>
                      {flow.isComplete ? (
                        <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
                      ) : (
                        <Icon className="h-6 w-6" />
                      )}
                    </div>
                    <div className="flex-1">
                      <CardTitle className="text-base">{flow.name}</CardTitle>
                      <p className="text-sm text-muted-foreground">
                        For {flow.userRole.toLowerCase().replace('_', ' ')} accounts
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {isActive && (
                      <Badge variant="default" className="gap-1">
                        <Clock className="h-3 w-3" />
                        In Progress
                      </Badge>
                    )}
                    {flow.isComplete && (
                      <Badge variant="secondary" className="gap-1 bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                        <CheckCircle className="h-3 w-3" />
                        Complete
                      </Badge>
                    )}
                    {!flow.isComplete && !isActive && allRequiredComplete && (
                      <Badge variant="outline" className="gap-1">
                        <TrendingUp className="h-3 w-3" />
                        Ready to Finish
                      </Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              
              <CardContent className="space-y-4">
                {/* Progress Bar */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      {completedSteps} of {flow.steps.length} steps complete
                    </span>
                    <span className="font-medium">{flow.progress}%</span>
                  </div>
                  <Progress value={flow.progress} className="h-2" />
                </div>

                {/* Step Breakdown */}
                <div className="grid gap-2">
                  {flow.steps.slice(0, 3).map((step, index) => (
                    <div key={step.id} className="flex items-center gap-3 text-sm">
                      <div className={cn(
                        "w-5 h-5 rounded-full flex items-center justify-center text-xs",
                        step.isComplete 
                          ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                          : index === flow.currentStepIndex && isActive
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground"
                      )}>
                        {step.isComplete ? (
                          <CheckCircle className="h-3 w-3" />
                        ) : (
                          index + 1
                        )}
                      </div>
                      <span className={cn(
                        step.isComplete ? "line-through text-muted-foreground" : "",
                        index === flow.currentStepIndex && isActive ? "font-medium" : ""
                      )}>
                        {step.title}
                      </span>
                      {step.isRequired && (
                        <Badge variant="secondary" className="text-xs">
                          Required
                        </Badge>
                      )}
                    </div>
                  ))}
                  {flow.steps.length > 3 && (
                    <div className="text-xs text-muted-foreground ml-8">
                      +{flow.steps.length - 3} more steps...
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-2 pt-2">
                  {!flow.isComplete && !isActive && showResume && (
                    <Button
                      onClick={() => startOnboarding(flow.id)}
                      size="sm"
                      variant="outline"
                      className="gap-2"
                    >
                      <Play className="h-4 w-4" />
                      {flow.progress > 0 ? 'Resume' : 'Start'} Setup
                    </Button>
                  )}
                  
                  {isActive && (
                    <Badge variant="outline" className="gap-1">
                      <Clock className="h-3 w-3" />
                      Currently Active
                    </Badge>
                  )}
                  
                  {flow.isComplete && (
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="gap-1 bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                        <CheckCircle className="h-3 w-3" />
                        Completed
                      </Badge>
                      {showReset && (
                        <Button
                          onClick={resetOnboarding}
                          size="sm"
                          variant="ghost"
                          className="gap-2 text-muted-foreground hover:text-foreground"
                        >
                          <RotateCcw className="h-4 w-4" />
                          Reset
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Summary */}
      <Card className="bg-muted/30">
        <CardContent className="p-4">
          <div className="text-center space-y-2">
            <h4 className="font-medium">Overall Progress</h4>
            <div className="flex items-center justify-center gap-4">
              <div className="text-center">
                <div className="text-lg font-bold text-green-600 dark:text-green-400">
                  {Object.values(flows).filter(f => f.isComplete).length}
                </div>
                <div className="text-xs text-muted-foreground">Complete</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-blue-600 dark:text-blue-400">
                  {Object.values(flows).filter(f => !f.isComplete && f.progress > 0).length}
                </div>
                <div className="text-xs text-muted-foreground">In Progress</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-gray-600 dark:text-gray-400">
                  {Object.values(flows).filter(f => f.progress === 0).length}
                </div>
                <div className="text-xs text-muted-foreground">Not Started</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ProgressTracker;