import { useState, useEffect, ChangeEvent } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

// Database types
interface Database {
  public: {
    Tables: {
      movies: {
        Row: {
          movie_id: number;
          movie_title: string;
        };
        Insert: {
          movie_id?: number;
          movie_title: string;
        };
        Update: {
          movie_id?: number;
          movie_title?: string;
        };
      };
      users: {
        Row: {
          user_id: number;
          name: string;
          email: string | null;
          created_at: string;
        };
        Insert: {
          user_id?: number;
          name: string;
          email?: string | null;
          created_at?: string;
        };
        Update: {
          user_id?: number;
          name?: string;
          email?: string | null;
          created_at?: string;
        };
      };
      movie_nights: {
        Row: {
          night_id: number;
          date: string;
          movie_id: number | null;
        };
        Insert: {
          night_id?: number;
          date: string;
          movie_id?: number | null;
        };
        Update: {
          night_id?: number;
          date?: string;
          movie_id?: number | null;
        };
      };
      submissions: {
        Row: {
          submission_id: number;
          night_id: number;
          user_id: number;
          movie_title: string;
          created_at: string;
        };
        Insert: {
          submission_id?: number;
          night_id: number;
          user_id: number;
          movie_title: string;
          created_at?: string;
        };
        Update: {
          submission_id?: number;
          night_id?: number;
          user_id?: number;
          movie_title?: string;
          created_at?: string;
        };
      };
      votes: {
        Row: {
          vote_id: number;
          submission_id: number;
          user_id: number;
          created_at: string;
        };
        Insert: {
          vote_id?: number;
          submission_id: number;
          user_id: number;
          created_at?: string;
        };
        Update: {
          vote_id?: number;
          submission_id?: number;
          user_id?: number;
          created_at?: string;
        };
      };
    };
  };
}

// Types for joined data
interface SubmissionWithDetails {
  submission_id: number;
  night_id: number;
  user_id: number;
  movie_title: string;
  created_at: string;
  users: Database['public']['Tables']['users']['Row'] | null;
  votes: Database['public']['Tables']['votes']['Row'][];
  voteCount: number;
}

type Phase = 'submission' | 'voting' | 'winner';

// Initialize Supabase with types
const supabaseUrl: string = 'https://mqnuasicmarimjpwdfej.supabase.co';
const supabaseKey: string = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1xbnVhc2ljbWFyaW1qcHdkZmVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzYzMTU0OTcsImV4cCI6MjA1MTg5MTQ5N30.2gm_VhLoZ4a5vwq5E1FQ_fYsZSDaMBRu9SDB24wje4o';
const supabase = createClient<Database>(supabaseUrl, supabaseKey);

function App() {
  const [currentPhase, setCurrentPhase] = useState<Phase>('submission');
  const [submissions, setSubmissions] = useState<SubmissionWithDetails[]>([]);
  const [movieTitle, setMovieTitle] = useState<string>('');
  const [currentUser, setCurrentUser] = useState<Database['public']['Tables']['users']['Row'] | null>(null);
  const [winner, setWinner] = useState<SubmissionWithDetails | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    determineCurrentPhase();
    fetchSubmissions();
    // In a real app, you'd want to fetch the current user here
    setCurrentUser({
      user_id: 1,
      name: 'Test User',
      email: null,
      created_at: new Date().toISOString()
    });
  }, []);

  const determineCurrentPhase = (): void => {
    const today = new Date();
    const dayOfWeek = today.getDay();

    if (dayOfWeek === 4) {
      setCurrentPhase('winner');
    } else if (dayOfWeek === 3) {
      setCurrentPhase('voting');
    } else {
      setCurrentPhase('submission');
    }
  };

  const fetchSubmissions = async (): Promise<void> => {
    try {
      const { data, error } = await supabase
        .from('submissions')
        .select(`
          *,
          users (*),
          votes (*)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const submissionsWithDetails: SubmissionWithDetails[] = data.map(submission => ({
        ...submission,
        voteCount: submission.votes?.length || 0
      }));

      setSubmissions(submissionsWithDetails);

      if (currentPhase === 'winner') {
        const winningSubmission = submissionsWithDetails.reduce((prev, current) => 
          (current.voteCount > prev.voteCount) ? current : prev
        );
        setWinner(winningSubmission);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      console.error('Error fetching submissions:', err);
    }
  };

  const handleSubmitMovie = async (): Promise<void> => {
    if (!movieTitle.trim() || !currentUser) return;

    try {
      const { error } = await supabase
        .from('submissions')
        .insert({
          night_id: getCurrentMovieNight(),
          user_id: currentUser.user_id,
          movie_title: movieTitle
        });

      if (error) throw error;

      setMovieTitle('');
      fetchSubmissions();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      console.error('Error submitting movie:', err);
    }
  };

  const handleVote = async (submissionId: number): Promise<void> => {
    if (!currentUser) return;

    try {
      const { error } = await supabase
        .from('votes')
        .insert({
          submission_id: submissionId,
          user_id: currentUser.user_id
        });

      if (error) throw error;

      fetchSubmissions();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      console.error('Error voting:', err);
    }
  };

  const getCurrentMovieNight = (): number => {
    // In a real app, you'd want to fetch or calculate the current movie night ID
    return 1;
  };

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Movie Night - {currentPhase.toUpperCase()}</CardTitle>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
              {error}
            </div>
          )}

          {currentPhase === 'submission' && (
            <div className="space-y-4">
              <div className="flex gap-4">
                <Input
                  type="text"
                  value={movieTitle}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setMovieTitle(e.target.value)}
                  placeholder="Enter movie title"
                  className="flex-1"
                />
                <Button onClick={handleSubmitMovie}>Submit Movie</Button>
              </div>
              <div className="space-y-2">
                {submissions.map((submission) => (
                  <div key={submission.submission_id} className="p-4 border rounded">
                    <p className="font-medium">{submission.movie_title}</p>
                    <p className="text-sm text-gray-600">Submitted by: {submission.users?.name}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {currentPhase === 'voting' && (
            <div className="space-y-2">
              {submissions.map((submission) => (
                <div key={submission.submission_id} className="p-4 border rounded flex justify-between items-center">
                  <div>
                    <p className="font-medium">{submission.movie_title}</p>
                    <p className="text-sm text-gray-600">
                      Votes: {submission.voteCount}
                    </p>
                  </div>
                  <Button onClick={() => handleVote(submission.submission_id)}>
                    Vote
                  </Button>
                </div>
              ))}
            </div>
          )}

          {currentPhase === 'winner' && winner && (
            <div className="text-center">
              <h2 className="text-2xl font-bold mb-2">🎉 Winner 🎉</h2>
              <p className="text-xl">{winner.movie_title}</p>
              <p className="text-sm text-gray-600">
                Submitted by: {winner.users?.name}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default App;